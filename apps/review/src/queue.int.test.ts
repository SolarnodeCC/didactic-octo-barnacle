import {
  type CurrentVerdict,
  type ReviewDetailResponse,
  type ReviewExportLine,
  type ReviewQueueResponse,
} from "@roi/models";
import { beforeEach, describe, expect, it } from "vitest";

import { handleApi, type AppDeps } from "./app.js";
import {
  createTestDatabase,
  insertExtraction,
  insertPublication,
  insertTriage,
} from "./test/sqlite-d1.js";

const ORIGIN = "https://review.wispel.cc";
const TOKEN = "valid-token";
const ABSTRACT = "Hospital pharmacists spend hours every week reconciling drug lists by hand.";

type Fixture = { Deps: AppDeps; Raw: ReturnType<typeof createTestDatabase>["Raw"] };

function setup(sampleSize = 20): Fixture {
  const { Db, Raw } = createTestDatabase();
  let id = 0;
  let clock = 0;
  return {
    Raw,
    Deps: {
      Db,
      Authenticate: (token) => Promise.resolve(token === TOKEN ? { Subject: "subject-1" } : null),
      NewId: () => `review-${(id += 1)}`,
      Now: () => new Date(Date.UTC(2026, 10, 24, 12, 0, (clock += 1))).toISOString(),
      SampleSize: sampleSize,
    },
  };
}

function get(path: string): Request {
  return new Request(`${ORIGIN}${path}`, { headers: { "Cf-Access-Jwt-Assertion": TOKEN } });
}

function post(path: string, body: unknown): Request {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: {
      "Cf-Access-Jwt-Assertion": TOKEN,
      "Content-Type": "application/json",
      Origin: ORIGIN,
    },
    body: JSON.stringify(body),
  });
}

async function queue(fixture: Fixture, day?: string): Promise<ReviewQueueResponse> {
  const response = await handleApi(
    get(`/api/review/queue${day ? `?day=${day}` : ""}`),
    fixture.Deps,
  );
  expect(response.status).toBe(200);
  return (await response.json()) as ReviewQueueResponse;
}

/** Day 1: 8 publications of different kinds. Day 2: one publication. */
function seed(raw: Fixture["Raw"]): void {
  for (let n = 1; n <= 8; n += 1) {
    const id = insertPublication(raw, n, { Abstract: ABSTRACT });
    const accepted = n % 2 === 1;
    insertTriage(raw, id, {
      Accepted: accepted,
      CreatedAt: `2026-11-22T08:0${n}:00.000Z`,
      Score: accepted ? 0.8 : n === 2 ? 0.4 : 0.2,
    });
    if (accepted) {
      insertExtraction(
        raw,
        id,
        n === 1
          ? []
          : [
              {
                Finding: "Reconciling takes hours",
                EvidenceQuote: "spend hours every week",
                CustomerQuote: "Hospital pharmacists",
              },
            ],
        { Confidence: n === 3 ? 0.3 : 0.6 },
      );
    }
  }
  const late = insertPublication(raw, 9, { Abstract: ABSTRACT });
  insertTriage(raw, late, { Accepted: false, CreatedAt: "2026-11-23T08:00:00.000Z" });
}

describe("REQ-REV-006: daily review queue", () => {
  let fixture: Fixture;
  beforeEach(() => {
    fixture = setup(5);
    seed(fixture.Raw);
  });

  it("REQ-REV-006: opens the newest decision day and lists recent days", async () => {
    const body = await queue(fixture);
    expect(body.Day).toBe("2026-11-23");
    expect(body.Days).toEqual(["2026-11-23", "2026-11-22"]);
    expect(body.Items.map((i) => i.PublicationId)).toEqual(["pub-9"]);
  });

  it("REQ-REV-006: stores the sample so every reload shows the same items with their stratum", async () => {
    const first = await queue(fixture, "2026-11-22");
    expect(first.Items).toHaveLength(5);
    const second = await queue(fixture, "2026-11-22");
    expect(second.Items).toEqual(first.Items);
    const strata = new Map(first.Items.map((i) => [i.PublicationId, i.Stratum]));
    // pub-2 (score 0.4) is the only borderline decision; on a fresh database every prompt
    // version is new, so the new-prompt stratum stays empty.
    expect(strata.get("pub-2")).toBe("borderline");
    expect([...strata.values()]).not.toContain("new-prompt");
    expect(fixture.Raw.prepare("SELECT COUNT(*) AS n FROM review_sample").get()).toEqual({ n: 5 });
  });

  it("REQ-REV-006: tops up a short sample when the day's run adds decisions later", async () => {
    fixture.Raw.prepare(
      "DELETE FROM triage_decision WHERE publication_id IN ('pub-5','pub-6','pub-7','pub-8')",
    ).run();
    expect((await queue(fixture, "2026-11-22")).Items).toHaveLength(4);
    insertTriage(fixture.Raw, "pub-6", { Accepted: false, CreatedAt: "2026-11-22T09:00:00.000Z" });
    const after = await queue(fixture, "2026-11-22");
    expect(after.Items).toHaveLength(5);
    expect(after.Items[4]?.PublicationId).toBe("pub-6");
  });

  it("REQ-REV-006: counts a publication as done when every target has a verdict", async () => {
    await handleApi(
      post("/api/review/verdicts", {
        TargetKind: "triage",
        TargetId: "triage-pub-9",
        Verdict: "correct",
      }),
      fixture.Deps,
    );
    const body = await queue(fixture, "2026-11-23");
    expect(body.Done).toBe(1);
    expect(body.Items[0]).toMatchObject({ ReviewedTargets: 1, Targets: 1 });
  });

  it("REQ-REV-006: refuses a malformed day", async () => {
    const response = await handleApi(get("/api/review/queue?day=yesterday"), fixture.Deps);
    expect(response.status).toBe(400);
  });

  it("REQ-REV-006: answers an empty queue before any decision exists", async () => {
    const empty = setup();
    expect(await queue(empty)).toEqual({ Day: null, Items: [], Done: 0, Days: [] });
  });
});

describe("REQ-REV-007: error tags", () => {
  let fixture: Fixture;
  beforeEach(() => {
    fixture = setup();
    seed(fixture.Raw);
  });

  it("REQ-REV-007: stores tags with an incorrect verdict and returns them as current", async () => {
    const response = await handleApi(
      post("/api/review/verdicts", {
        TargetKind: "candidate",
        TargetId: "cand-pub-3-1",
        Verdict: "incorrect",
        Tags: ["customer-wrong", "overstated", "customer-wrong"],
      }),
      fixture.Deps,
    );
    expect(response.status).toBe(201);
    expect(((await response.json()) as CurrentVerdict).Tags).toEqual([
      "customer-wrong",
      "overstated",
    ]);
    const detail = (await (
      await handleApi(get("/api/review/publications/pub-3"), fixture.Deps)
    ).json()) as ReviewDetailResponse;
    expect(detail.Candidates[0]?.Current?.Tags).toEqual(["customer-wrong", "overstated"]);
  });

  it("REQ-REV-007: refuses a tag of the other step and tags on a correct verdict", async () => {
    const wrongStep = await handleApi(
      post("/api/review/verdicts", {
        TargetKind: "triage",
        TargetId: "triage-pub-3",
        Verdict: "incorrect",
        Tags: ["duplicate"],
      }),
      fixture.Deps,
    );
    expect(wrongStep.status).toBe(400);
    const onCorrect = await handleApi(
      post("/api/review/verdicts", {
        TargetKind: "triage",
        TargetId: "triage-pub-3",
        Verdict: "correct",
        Tags: ["should-reject"],
      }),
      fixture.Deps,
    );
    expect(onCorrect.status).toBe(400);
  });
});

describe("REQ-REV-008: structured corrections and undo", () => {
  let fixture: Fixture;
  beforeEach(() => {
    fixture = setup();
    seed(fixture.Raw);
  });

  it("REQ-REV-008: stores corrected triage signals", async () => {
    const signals = {
      NamedParty: true,
      StatedHarm: true,
      Trigger: true,
      ExistingAlternative: false,
      Adoptable: false,
    };
    const response = await handleApi(
      post("/api/review/verdicts", {
        TargetKind: "triage",
        TargetId: "triage-pub-2",
        Verdict: "incorrect",
        Tags: ["should-accept"],
        CorrectedSignals: signals,
      }),
      fixture.Deps,
    );
    expect(response.status).toBe(201);
    expect(((await response.json()) as CurrentVerdict).CorrectedSignals).toEqual(signals);
  });

  it("REQ-REV-008: accepts a corrected quote that occurs in the abstract and refuses one that does not", async () => {
    const ok = await handleApi(
      post("/api/review/verdicts", {
        TargetKind: "candidate",
        TargetId: "cand-pub-3-1",
        Verdict: "incorrect",
        CorrectedCandidate: {
          Customer: "Hospital pharmacists",
          EvidenceQuote: "reconciling  drug lists by hand",
        },
      }),
      fixture.Deps,
    );
    expect(ok.status).toBe(201);
    const bad = await handleApi(
      post("/api/review/verdicts", {
        TargetKind: "candidate",
        TargetId: "cand-pub-3-1",
        Verdict: "incorrect",
        CorrectedCandidate: { EvidenceQuote: "words the paper never says" },
      }),
      fixture.Deps,
    );
    expect(bad.status).toBe(400);
  });

  it("REQ-REV-008: undo restores the previous verdict, keeps the history, and then clears the target", async () => {
    const target = { TargetKind: "triage", TargetId: "triage-pub-9" };
    await handleApi(post("/api/review/verdicts", { ...target, Verdict: "unsure" }), fixture.Deps);
    await handleApi(post("/api/review/verdicts", { ...target, Verdict: "correct" }), fixture.Deps);

    const first = await handleApi(post("/api/review/undo", target), fixture.Deps);
    expect(((await first.json()) as { Current: CurrentVerdict | null }).Current?.Verdict).toBe(
      "unsure",
    );
    const second = await handleApi(post("/api/review/undo", target), fixture.Deps);
    expect(((await second.json()) as { Current: CurrentVerdict | null }).Current).toBeNull();
    expect((await handleApi(post("/api/review/undo", target), fixture.Deps)).status).toBe(404);

    const lines = (await (await handleApi(get("/api/review/export"), fixture.Deps)).text())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as ReviewExportLine);
    expect(lines.map((l) => [l.Verdict, l.WithdrawnAt !== null])).toEqual([
      ["unsure", true],
      ["correct", true],
    ]);
    const stats = (await (await handleApi(get("/api/review/stats"), fixture.Deps)).json()) as {
      Rows: unknown[];
    };
    expect(stats.Rows).toEqual([]);
  });

  it("REQ-REV-008: refuses an undo from another origin", async () => {
    const request = new Request(`${ORIGIN}/api/review/undo`, {
      method: "POST",
      headers: { "Cf-Access-Jwt-Assertion": TOKEN, Origin: "https://evil.example" },
      body: JSON.stringify({ TargetKind: "triage", TargetId: "triage-pub-9" }),
    });
    expect((await handleApi(request, fixture.Deps)).status).toBe(403);
  });
});
