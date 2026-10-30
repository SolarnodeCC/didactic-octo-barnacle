import { describe, expect, it, vi } from "vitest";

import { formatAlert } from "./format.js";
import { createAlertSink, ALERT_DEDUPE_WINDOW_MS } from "./sink.js";
import { handleDeadLetter } from "../queue/dead-letter.js";
import { runScheduled } from "../schedule/run-scheduled.js";
import { startRun } from "../schedule/start-run.js";
import { createAlertNetwork } from "../test/fake-alert-network.js";
import { createHarness, makeWork, openAlexPage, type Harness } from "../test/harness.js";

const OPENALEX_CRON = "0 6 * * *";
const ARXIV_CRON = "30 7 * * *";
const GITHUB_TOKEN = "ghp_SECRETTOKEN000000000000000000";
const RESEND_KEY = "re_SECRETKEY0000";
const HOUR = 60 * 60 * 1000;

const noSleep = { MaxAttempts: 3, BaseMs: 1, Sleep: () => Promise.resolve() };

function setup(channels: { github?: boolean; email?: boolean } = { github: true, email: true }) {
  const h = createHarness();
  const network = createAlertNetwork();
  const logs: Array<{ event: string; fields: Record<string, unknown> }> = [];
  const sink = createAlertSink({
    Db: h.Database.Db,
    Fetch: network.fetchFn,
    Backoff: noSleep,
    Now: () => h.Clock.Now,
    Environment: "staging",
    Log: (event, fields) => logs.push({ event, fields }),
    ...(channels.github
      ? { Github: { Repo: "SolarnodeCC/didactic-octo-barnacle", Token: GITHUB_TOKEN } }
      : {}),
    ...(channels.email
      ? { Email: { ApiKey: RESEND_KEY, From: "onboarding@resend.dev", To: "ops@example.org" } }
      : {}),
  });
  h.Deps.Alert = sink;
  return { h, network, logs };
}

const boom = () => new Error("OpenAlex down");

/** A run whose second page keeps failing: the page is dead-lettered and the run fails. */
async function deadLetteredRun(h: Harness, cron = OPENALEX_CRON): Promise<void> {
  if (cron === OPENALEX_CRON) {
    h.SetOpenAlexPages([
      openAlexPage([makeWork(1), makeWork(2)], "c2"),
      boom(),
      boom(),
      boom(),
      boom(),
    ]);
  } else {
    h.SetArxivPages([boom(), boom(), boom(), boom()]);
  }
  await runScheduled(h.Deps, cron);
  await h.Drain({ MaxRetries: 3 });
}

function alertRow(h: Harness, key: string) {
  return h.Database.Raw.prepare("SELECT * FROM alert_state WHERE alert_key = ?").get(key) as
    Record<string, unknown> | undefined;
}

describe("REQ-NFR-019: alerts reach people by issue and email", () => {
  it("REQ-NFR-019: a dead-lettered message opens an issue labelled alert and sends an email", async () => {
    const { h, network } = setup();
    await deadLetteredRun(h);

    expect(network.issuesCreated()).toHaveLength(1);
    const issue = JSON.parse(network.issuesCreated()[0]?.body ?? "{}") as Record<string, unknown>;
    expect(issue["labels"]).toEqual(["alert"]);
    expect(issue["title"]).toBe("[alert] dead-letter in staging (openalex)");
    const body = String(issue["body"]);
    const runId = h.Run()["id"] as string;
    expect(body).toContain("Environment: staging");
    expect(body).toContain(`Run: ${runId}`);
    expect(body).toContain(`Message: fetch:${runId}:1`);
    expect(body).toContain(`Run report: /admin/runs/${runId}`);
    expect(body).toContain("Counts: fetched 2, created 2");

    expect(network.emails()).toHaveLength(1);
    expect(JSON.parse(network.emails()[0]?.body ?? "{}")).toMatchObject({
      from: "onboarding@resend.dev",
      to: ["ops@example.org"],
      subject: "[alert] dead-letter in staging (openalex)",
    });
    expect(alertRow(h, "dead-letter|staging|openalex")).toMatchObject({
      issue_number: 42,
      occurrences: 1,
    });
  });

  it("REQ-NFR-019: a repeat within 24 hours comments on the open issue and sends no email", async () => {
    const { h, network } = setup();
    await deadLetteredRun(h);
    h.Clock.Now = "2026-10-30T07:30:00.000Z";
    await deadLetteredRun(h);

    expect(network.issuesCreated()).toHaveLength(1);
    expect(network.emails()).toHaveLength(1);
    expect(network.comments()).toHaveLength(1);
    expect(network.comments()[0]?.url).toBe(
      "https://api.github.com/repos/SolarnodeCC/didactic-octo-barnacle/issues/42/comments",
    );
    expect(JSON.parse(network.comments()[0]?.body ?? "{}")["body"]).toContain("occurrence 2");
    expect(alertRow(h, "dead-letter|staging|openalex")).toMatchObject({
      issue_number: 42,
      occurrences: 2,
    });
  });

  it("REQ-NFR-019: after 24 hours the same key opens a new issue and sends a new email", async () => {
    const { h, network } = setup();
    await deadLetteredRun(h);
    h.Clock.Now = new Date(Date.parse(h.Clock.Now) + ALERT_DEDUPE_WINDOW_MS + HOUR).toISOString();
    await deadLetteredRun(h);

    expect(network.issuesCreated()).toHaveLength(2);
    expect(network.emails()).toHaveLength(2);
    expect(network.comments()).toHaveLength(0);
    expect(alertRow(h, "dead-letter|staging|openalex")).toMatchObject({
      issue_number: 43,
      occurrences: 1,
    });
  });

  it("REQ-NFR-019: another source is another alert", async () => {
    const { h, network } = setup();
    await deadLetteredRun(h);
    await deadLetteredRun(h, ARXIV_CRON);

    expect(network.issuesCreated()).toHaveLength(2);
    expect(network.emails()).toHaveLength(2);
    expect(alertRow(h, "dead-letter|staging|arxiv")).toBeDefined();
  });

  it("REQ-NFR-019: a run that cannot start raises a failed-run alert and the error still surfaces", async () => {
    const { h, network } = setup();
    vi.spyOn(h.Queue, "send").mockRejectedValueOnce(new Error("queue down"));

    await expect(runScheduled(h.Deps, OPENALEX_CRON)).rejects.toThrow(/first page/);
    const issue = JSON.parse(network.issuesCreated()[0]?.body ?? "{}") as {
      title: string;
      body: string;
    };
    expect(issue.title).toBe("[alert] failed-run in staging (openalex)");
    expect(issue.body).toContain(`Run: ${h.Run()["id"] as string}`);
    expect(h.Run()["status"]).toBe("failed");
  });

  it("REQ-NFR-019: a run past its time window raises a run-timeout alert with its report", async () => {
    const { h, network } = setup();
    h.SetOpenAlexPages([openAlexPage([makeWork(1)], null)]);
    await runScheduled(h.Deps, OPENALEX_CRON); // stays open: nobody drains the queue
    h.Clock.Now = "2026-10-30T13:00:00.000Z";
    await startRun(h.Deps, "openalex");

    const issue = JSON.parse(network.issuesCreated()[0]?.body ?? "{}") as {
      title: string;
      body: string;
    };
    expect(issue.title).toBe("[alert] run-timeout in staging (openalex)");
    expect(issue.body).toContain("Run status: failed");
  });
});

describe("REQ-NFR-019: an alert never carries content or credentials", () => {
  it("REQ-NFR-019: no publication text and no credential appears in any request body or URL", async () => {
    const { h, network } = setup();
    await deadLetteredRun(h);

    const everything = network.requests.map((r) => `${r.url}\n${r.body}`).join("\n");
    expect(everything).not.toContain("Opportunity research paper");
    expect(everything).not.toContain("Clinical decision support");
    expect(everything).not.toContain(GITHUB_TOKEN);
    expect(everything).not.toContain(RESEND_KEY);
  });

  it("REQ-NFR-019: credentials are sent only in the authorization header", async () => {
    const { h, network } = setup();
    await deadLetteredRun(h);

    const github = network.issuesCreated()[0];
    const email = network.emails()[0];
    expect(github?.headers.get("authorization")).toBe(`Bearer ${GITHUB_TOKEN}`);
    expect(email?.headers.get("authorization")).toBe(`Bearer ${RESEND_KEY}`);
    expect(network.requests.map((r) => r.url).join("")).not.toMatch(/token|key/i);
  });

  it("REQ-NFR-019: failure reasons in an alert are shortened and cleaned", () => {
    const { Body } = formatAlert("staging", {
      Type: "failed-run",
      Source: "openalex",
      RunId: "run_1",
      Summary: "Start failed at https://internal.example.org/x?token=abc and more",
      Report: {
        RunId: "run_1",
        Source: "openalex",
        Status: "failed",
        StartedAt: "2026-10-30T06:00:00.000Z",
        EndedAt: null,
        WindowFrom: null,
        PagesDone: 0,
        Counts: { Fetched: 0, Created: 0, Updated: 0, Skipped: 0, Failed: 1, DeadLettered: 0 },
        Failures: [
          { SourceId: "W1", Reason: `see https://x.test/p?k=1 ${"z".repeat(300)}` },
          ...Array.from({ length: 6 }, (_, i) => ({ SourceId: `W${i + 2}`, Reason: "bad" })),
        ],
        DeadLetteredMessages: [],
        DataQuality: { IncompleteRecords: 0, DuplicatesFlagged: 0, FailedPdfs: 0 },
      },
    });
    expect(Body).not.toContain("https://");
    expect(Body).toContain("[link]");
    expect(Body).toContain("and 2 more"); // only five failed items are listed
    expect(Body.split(/\r?\n/).every((line) => line.length < 320)).toBe(true);
  });
});

describe("REQ-NFR-019: a broken channel never stops the pipeline", () => {
  it("REQ-NFR-019: GitHub failing still sends the email, and the next repeat opens the issue", async () => {
    const { h, network, logs } = setup();
    network.mode.github = "forbidden";
    await deadLetteredRun(h);

    expect(network.emails()).toHaveLength(1);
    expect(
      logs.some((l) => l.event === "alert.delivery_failed" && l.fields["channel"] === "github"),
    ).toBe(true);
    expect(alertRow(h, "dead-letter|staging|openalex")).toMatchObject({ issue_number: null });

    network.mode.github = "ok";
    h.Clock.Now = "2026-10-30T08:00:00.000Z";
    await deadLetteredRun(h);
    expect(network.issuesCreated()).toHaveLength(2); // the refused try, then the one that works
    expect(network.emails()).toHaveLength(1); // no second email inside the window
    expect(alertRow(h, "dead-letter|staging|openalex")).toMatchObject({
      issue_number: 42,
      occurrences: 2,
    });
  });

  it("REQ-NFR-019: email failing still opens the issue", async () => {
    const { h, network } = setup();
    network.mode.email = "forbidden";
    await deadLetteredRun(h);
    expect(network.issuesCreated()).toHaveLength(1);
    expect(alertRow(h, "dead-letter|staging|openalex")).toMatchObject({ issue_number: 42 });
  });

  it("REQ-NFR-019: a temporary 502 from GitHub is retried", async () => {
    const { h, network } = setup();
    network.mode.github = "error-once";
    await deadLetteredRun(h);
    expect(network.issuesCreated()).toHaveLength(2); // one 502, then the retry that works
    expect(alertRow(h, "dead-letter|staging|openalex")).toMatchObject({ issue_number: 42 });
  });

  it("REQ-NFR-019: no channel configured sends nothing and stores no state", async () => {
    const { h, network, logs } = setup({});
    await deadLetteredRun(h);
    expect(network.requests).toHaveLength(0);
    expect(logs.some((l) => l.event === "alert.not_configured")).toBe(true);
    expect(alertRow(h, "dead-letter|staging|openalex")).toBeUndefined();
    expect(h.Run()["status"]).toBe("failed");
  });

  it("REQ-NFR-019: a sink that throws does not stop the dead-letter handling", async () => {
    const h = createHarness();
    h.Deps.Alert = () => Promise.reject(new Error("sink exploded"));
    await deadLetteredRun(h);
    expect(h.Queue.deadLettered).toHaveLength(1);
    expect(h.Run()["status"]).toBe("failed");
  });

  it("REQ-NFR-019: an unreadable dead letter still raises an alert", async () => {
    const { h, network } = setup();
    expect(await handleDeadLetter(h.Deps, { garbage: true })).toBe("unreadable");
    expect(JSON.parse(network.issuesCreated()[0]?.body ?? "{}")["title"]).toBe(
      "[alert] dead-letter in staging (unknown)",
    );
  });

  it("REQ-NFR-019: a dead letter that is recorded twice alerts once", async () => {
    const { h, network } = setup();
    await deadLetteredRun(h);
    const message = h.Queue.deadLettered[0];
    expect(await handleDeadLetter(h.Deps, message)).toBe("already-recorded");
    expect(network.issuesCreated()).toHaveLength(1);
    expect(network.comments()).toHaveLength(0);
  });
});

describe("REQ-NFR-008: a failed scheduled run raises an alert", () => {
  it("REQ-NFR-008: the run that dead-lettered is closed as failed and was alerted", async () => {
    const { h, network } = setup();
    await deadLetteredRun(h);
    expect(h.Run()["status"]).toBe("failed");
    expect(network.issuesCreated()).toHaveLength(1);
  });
});
