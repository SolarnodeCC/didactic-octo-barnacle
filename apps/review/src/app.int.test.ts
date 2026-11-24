import {
  type CurrentVerdict,
  type ReviewDetailResponse,
  type ReviewListResponse,
  type ReviewStatsResponse,
} from "@roi/models";
import { beforeEach, describe, expect, it } from "vitest";

import { handleApi, type AppDeps } from "./app.js";
import { CONTENT_SECURITY_POLICY } from "./http.js";
import {
  createTestDatabase,
  insertExtraction,
  insertPublication,
  insertTriage,
} from "./test/sqlite-d1.js";

const ORIGIN = "https://review.wispel.cc";
const TOKEN = "valid-token";

type Fixture = { Deps: AppDeps; Raw: ReturnType<typeof createTestDatabase>["Raw"] };

function setup(): Fixture {
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
    },
  };
}

function get(path: string, token: string | null = TOKEN): Request {
  const headers = new Headers();
  if (token) headers.set("Cf-Access-Jwt-Assertion", token);
  return new Request(`${ORIGIN}${path}`, { headers });
}

function post(path: string, body: unknown, origin: string | null = ORIGIN): Request {
  const headers = new Headers({
    "Cf-Access-Jwt-Assertion": TOKEN,
    "Content-Type": "application/json",
  });
  if (origin) headers.set("Origin", origin);
  return new Request(`${ORIGIN}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
}

const ABSTRACT =
  "Hospital pharmacists spend “hours” every week reconciling drug lists. We show that a model halves the time.";

/** Three publications: one accepted with two candidates (one retracted), two rejected. */
function seed(raw: Fixture["Raw"]): void {
  const p1 = insertPublication(raw, 1, { Abstract: ABSTRACT, Title: "<script>alert(1)</script>" });
  insertTriage(raw, p1, { Accepted: true, CreatedAt: "2026-11-22T08:00:00.000Z" });
  insertExtraction(raw, p1, [
    {
      Finding: "Reconciling drug lists takes hours",
      EvidenceQuote: 'spend "hours" every week reconciling drug lists',
      CustomerQuote: "Hospital pharmacists",
    },
    { Finding: "Hidden", EvidenceQuote: "x", CustomerQuote: "y", Hidden: true },
  ]);
  const p2 = insertPublication(raw, 2);
  insertTriage(raw, p2, { Accepted: false, CreatedAt: "2026-11-21T08:00:00.000Z" });
  const p3 = insertPublication(raw, 3);
  insertTriage(raw, p3, {
    Accepted: false,
    CreatedAt: "2026-11-20T08:00:00.000Z",
    PromptVersion: "triage-v2",
  });
}

describe("REQ-REV-005: API access and headers", () => {
  let fixture: Fixture;
  beforeEach(() => {
    fixture = setup();
    seed(fixture.Raw);
  });

  it("REQ-REV-005: refuses a request without a valid Access token with 401 and no data", async () => {
    const response = await handleApi(get("/api/review/publications", null), fixture.Deps);
    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain("pub-1");
  });

  it("REQ-REV-005: refuses every request while Access is not configured", async () => {
    const response = await handleApi(get("/api/review/publications"), {
      ...fixture.Deps,
      Authenticate: null,
    });
    expect(response.status).toBe(503);
  });

  it("REQ-REV-005: sends the CSP, nosniff, and referrer headers", async () => {
    const response = await handleApi(get("/api/review/stats"), fixture.Deps);
    expect(response.headers.get("Content-Security-Policy")).toBe(CONTENT_SECURITY_POLICY);
    expect(CONTENT_SECURITY_POLICY).toContain("frame-ancestors 'none'");
    expect(CONTENT_SECURITY_POLICY).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
  });

  it("REQ-REV-005: refuses a verdict without a same-origin Origin header", async () => {
    const body = { TargetKind: "triage", TargetId: "triage-pub-1", Verdict: "correct" };
    for (const origin of [null, "https://evil.example"]) {
      const response = await handleApi(post("/api/review/verdicts", body, origin), fixture.Deps);
      expect(response.status).toBe(403);
    }
    expect(fixture.Raw.prepare("SELECT COUNT(*) AS n FROM output_review").get()).toEqual({ n: 0 });
  });
});

describe("REQ-REV-001: review list", () => {
  let fixture: Fixture;
  beforeEach(() => {
    fixture = setup();
    seed(fixture.Raw);
  });

  async function list(query = ""): Promise<ReviewListResponse> {
    const response = await handleApi(get(`/api/review/publications${query}`), fixture.Deps);
    expect(response.status).toBe(200);
    return (await response.json()) as ReviewListResponse;
  }

  it("REQ-REV-001: lists triaged publications newest first with visible candidate counts", async () => {
    const { Items } = await list();
    expect(Items.map((item) => item.PublicationId)).toEqual(["pub-1", "pub-2", "pub-3"]);
    expect(Items[0]).toMatchObject({
      TriageAccepted: true,
      TriageReason: "accepted",
      CandidateCount: 1,
      Targets: 2,
      ReviewedTargets: 0,
    });
  });

  it("REQ-REV-001: filters by outcome, reason, prompt version, and day", async () => {
    expect((await list("?accepted=no")).Items.map((i) => i.PublicationId)).toEqual([
      "pub-2",
      "pub-3",
    ]);
    expect((await list("?reason=accepted")).Items).toHaveLength(1);
    expect((await list("?promptVersion=triage-v2")).Items.map((i) => i.PublicationId)).toEqual([
      "pub-3",
    ]);
    expect((await list("?promptVersion=extraction-v1")).Items.map((i) => i.PublicationId)).toEqual([
      "pub-1",
    ]);
    expect((await list("?day=2026-11-21")).Items.map((i) => i.PublicationId)).toEqual(["pub-2"]);
  });

  it("REQ-REV-001: filters by reviewed when every target of a publication has a verdict", async () => {
    await handleApi(
      post("/api/review/verdicts", {
        TargetKind: "triage",
        TargetId: "triage-pub-2",
        Verdict: "correct",
      }),
      fixture.Deps,
    );
    expect((await list("?reviewed=yes")).Items.map((i) => i.PublicationId)).toEqual(["pub-2"]);
    expect((await list("?reviewed=no")).Items.map((i) => i.PublicationId)).toEqual([
      "pub-1",
      "pub-3",
    ]);
  });

  it("REQ-REV-001: pages with a cursor and refuses a malformed cursor", async () => {
    const first = await list("?limit=2");
    expect(first.Items.map((i) => i.PublicationId)).toEqual(["pub-1", "pub-2"]);
    expect(first.NextCursor).not.toBeNull();
    const second = await list(`?limit=2&cursor=${first.NextCursor}`);
    expect(second.Items.map((i) => i.PublicationId)).toEqual(["pub-3"]);
    expect(second.NextCursor).toBeNull();
    const bad = await handleApi(get("/api/review/publications?cursor=zzz"), fixture.Deps);
    expect(bad.status).toBe(400);
    const tooMany = await handleApi(get("/api/review/publications?limit=51"), fixture.Deps);
    expect(tooMany.status).toBe(400);
  });
});

describe("REQ-REV-002: review detail", () => {
  let fixture: Fixture;
  beforeEach(() => {
    fixture = setup();
    seed(fixture.Raw);
  });

  async function detail(id: string): Promise<ReviewDetailResponse> {
    const response = await handleApi(get(`/api/review/publications/${id}`), fixture.Deps);
    expect(response.status).toBe(200);
    return (await response.json()) as ReviewDetailResponse;
  }

  it("REQ-REV-002: returns the publication, triage, extraction, and visible candidates", async () => {
    const body = await detail("pub-1");
    expect(body.Publication).toMatchObject({ Id: "pub-1", Doi: "10.1000/paper.1" });
    expect(body.Triage).toMatchObject({
      Accepted: true,
      Score: 0.8,
      Model: "model-a",
      PromptVersion: "triage-v1",
      Signals: {
        NamedParty: true,
        StatedHarm: true,
        Trigger: true,
        ExistingAlternative: false,
        Adoptable: true,
      },
    });
    expect(body.Extraction).toMatchObject({
      InputMode: "abstract",
      PromptVersion: "extraction-v1",
    });
    expect(body.Candidates.map((c) => c.Id)).toEqual(["cand-pub-1-1"]);
    expect(body.PreviousId).toBeNull();
    expect(body.NextId).toBe("pub-2");
    expect((await detail("pub-2")).PreviousId).toBe("pub-1");
  });

  it("REQ-REV-002: returns hostile source text unchanged as JSON data, never as markup", async () => {
    const response = await handleApi(get("/api/review/publications/pub-1"), fixture.Deps);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    const body = (await response.json()) as ReviewDetailResponse;
    expect(body.Publication.Title).toBe("<script>alert(1)</script>");
  });

  it("REQ-REV-002: highlights quotes that occur in the abstract after normalisation (ADR 0064)", async () => {
    const body = await detail("pub-1");
    const spans = body.Highlights.map((h) => ({
      Text: ABSTRACT.slice(h.Start, h.End),
      Field: h.Field,
    }));
    expect(spans).toEqual([
      { Text: "Hospital pharmacists", Field: "CustomerQuote" },
      { Text: "spend “hours” every week reconciling drug lists", Field: "EvidenceQuote" },
    ]);
  });

  it("REQ-REV-002: answers not-found for a publication without a triage decision", async () => {
    insertPublication(fixture.Raw, 9);
    const response = await handleApi(get("/api/review/publications/pub-9"), fixture.Deps);
    expect(response.status).toBe(404);
  });
});

describe("REQ-REV-003: record a verdict", () => {
  let fixture: Fixture;
  beforeEach(() => {
    fixture = setup();
    seed(fixture.Raw);
  });

  async function record(body: unknown): Promise<Response> {
    return handleApi(post("/api/review/verdicts", body), fixture.Deps);
  }

  it("REQ-REV-003: stores the verdict with the subject, model, and prompt version of the output", async () => {
    const response = await record({
      TargetKind: "candidate",
      TargetId: "cand-pub-1-1",
      Verdict: "incorrect",
      Note: "customer too broad",
      Corrected: "Clinical pharmacists in hospitals",
    });
    expect(response.status).toBe(201);
    expect(fixture.Raw.prepare("SELECT * FROM output_review").get()).toMatchObject({
      target_kind: "candidate",
      publication_id: "pub-1",
      verdict: "incorrect",
      reviewer_opaque: "subject-1",
      model: "model-b",
      prompt_version: "extraction-v1",
    });
  });

  it("REQ-REV-003: a newer verdict replaces the current one and the history stays", async () => {
    await record({ TargetKind: "triage", TargetId: "triage-pub-1", Verdict: "unsure" });
    const second = await record({
      TargetKind: "triage",
      TargetId: "triage-pub-1",
      Verdict: "correct",
    });
    expect(((await second.json()) as CurrentVerdict).Verdict).toBe("correct");
    const response = await handleApi(get("/api/review/publications/pub-1"), fixture.Deps);
    const body = (await response.json()) as ReviewDetailResponse;
    expect(body.Triage.Current?.Verdict).toBe("correct");
    expect(fixture.Raw.prepare("SELECT COUNT(*) AS n FROM output_review").get()).toEqual({ n: 2 });
  });

  it("REQ-REV-003: refuses an unknown or hidden target with not-found and a bad body with 400", async () => {
    expect(
      (await record({ TargetKind: "triage", TargetId: "nope", Verdict: "correct" })).status,
    ).toBe(404);
    expect(
      (await record({ TargetKind: "candidate", TargetId: "cand-pub-1-2", Verdict: "correct" }))
        .status,
    ).toBe(404);
    expect(
      (await record({ TargetKind: "triage", TargetId: "triage-pub-1", Verdict: "great" })).status,
    ).toBe(400);
    expect(
      (
        await record({
          TargetKind: "triage",
          TargetId: "triage-pub-1",
          Verdict: "correct",
          Note: "x".repeat(501),
        })
      ).status,
    ).toBe(400);
  });
});

describe("REQ-REV-004: summary and export", () => {
  let fixture: Fixture;
  beforeEach(() => {
    fixture = setup();
    seed(fixture.Raw);
  });

  it("REQ-REV-004: counts current verdicts per step and prompt version with the agreement rate", async () => {
    const verdicts = [
      { TargetKind: "triage", TargetId: "triage-pub-1", Verdict: "incorrect" },
      { TargetKind: "triage", TargetId: "triage-pub-1", Verdict: "correct" },
      { TargetKind: "triage", TargetId: "triage-pub-2", Verdict: "incorrect" },
      { TargetKind: "triage", TargetId: "triage-pub-3", Verdict: "unsure" },
      { TargetKind: "candidate", TargetId: "cand-pub-1-1", Verdict: "correct" },
    ];
    for (const verdict of verdicts) {
      await handleApi(post("/api/review/verdicts", verdict), fixture.Deps);
    }
    const response = await handleApi(get("/api/review/stats"), fixture.Deps);
    const { Rows } = (await response.json()) as ReviewStatsResponse;
    expect(Rows).toEqual([
      {
        TargetKind: "triage",
        PromptVersion: "triage-v1",
        Correct: 1,
        Incorrect: 1,
        Unsure: 0,
        Agreement: 0.5,
      },
      {
        TargetKind: "triage",
        PromptVersion: "triage-v2",
        Correct: 0,
        Incorrect: 0,
        Unsure: 1,
        Agreement: null,
      },
      {
        TargetKind: "candidate",
        PromptVersion: "extraction-v1",
        Correct: 1,
        Incorrect: 0,
        Unsure: 0,
        Agreement: 1,
      },
    ]);
  });

  it("REQ-REV-004: exports every verdict as JSON lines, oldest first", async () => {
    await handleApi(
      post("/api/review/verdicts", {
        TargetKind: "triage",
        TargetId: "triage-pub-1",
        Verdict: "unsure",
      }),
      fixture.Deps,
    );
    await handleApi(
      post("/api/review/verdicts", {
        TargetKind: "triage",
        TargetId: "triage-pub-1",
        Verdict: "correct",
      }),
      fixture.Deps,
    );
    const response = await handleApi(get("/api/review/export"), fixture.Deps);
    expect(response.headers.get("Content-Type")).toContain("application/x-ndjson");
    const lines = (await response.text())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { Verdict: string; PromptVersion: string });
    expect(lines.map((line) => line.Verdict)).toEqual(["unsure", "correct"]);
    expect(lines[0]).toMatchObject({ PromptVersion: "triage-v1", PublicationId: "pub-1" });
  });
});
