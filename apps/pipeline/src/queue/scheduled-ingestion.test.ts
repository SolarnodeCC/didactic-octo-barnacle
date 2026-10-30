import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { replayDeadLetter } from "./replay.js";
import { runScheduled } from "../schedule/run-scheduled.js";
import { startRun } from "../schedule/start-run.js";
import {
  arxivPage,
  createHarness,
  makeBrokenWork,
  makeEntry,
  makeWork,
  openAlexPage,
  type Harness,
} from "../test/harness.js";

const OPENALEX_CRON = "0 6 * * *";
const ARXIV_CRON = "30 7 * * *";

let h: Harness;

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("REQ-TEST-003: unexpected network fetch"))),
  );
  h = createHarness();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function scriptTwoPages(): void {
  h.SetOpenAlexPages([
    openAlexPage([makeWork(1), makeWork(2)], "cursor-2"),
    openAlexPage([makeWork(3)], null),
  ]);
}

describe("REQ-DATA-009: scheduled ingestion through the queue", () => {
  it("REQ-DATA-009: a cron run pages through OpenAlex and stores every work once", async () => {
    scriptTwoPages();
    const started = await runScheduled(h.Deps, OPENALEX_CRON);
    expect(started?.Outcome).toBe("started");
    await h.Drain();

    expect(h.Count("publication")).toBe(3);
    expect(h.OpenAlexRequests).toEqual([
      { FromDate: "2026-09-30" },
      { FromDate: "2026-09-30", Cursor: "cursor-2" },
    ]);
    const run = h.Run();
    expect(run["status"]).toBe("succeeded");
    expect(run["pages_done"]).toBe(2);
    expect(JSON.parse(run["counts_json"] as string)).toMatchObject({
      Fetched: 3,
      Created: 3,
      Failed: 0,
    });
  });

  it("REQ-DATA-009: a first run backfills 30 days and stores its start, end, counts, and failures", async () => {
    scriptTwoPages();
    await runScheduled(h.Deps, OPENALEX_CRON);
    await h.Drain();

    const run = h.Run();
    expect(run["window_from"]).toBe("2026-09-30");
    expect(run["started_at"]).toBe("2026-10-30T06:00:00.000Z");
    expect(run["ended_at"]).not.toBeNull();
    expect(run["cursor"]).toBe("2026-10-30");
    expect(JSON.parse(run["failures_json"] as string)).toEqual([]);
  });

  it("REQ-DATA-009: the next run starts at the last window end minus the overlap", async () => {
    scriptTwoPages();
    await runScheduled(h.Deps, OPENALEX_CRON);
    await h.Drain();

    h.Clock.Now = "2026-10-31T06:00:00.000Z";
    h.SetOpenAlexPages([openAlexPage([makeWork(3), makeWork(4)], null)]);
    await runScheduled(h.Deps, OPENALEX_CRON);
    await h.Drain();

    expect(h.Run()["window_from"]).toBe("2026-10-28");
    expect(h.Count("publication")).toBe(4);
    expect(JSON.parse(h.Run()["counts_json"] as string)).toMatchObject({ Created: 1, Skipped: 1 });
  });

  it("REQ-DATA-009: a run is skipped while the previous one is still running", async () => {
    scriptTwoPages();
    await runScheduled(h.Deps, OPENALEX_CRON);
    h.Clock.Now = "2026-10-30T07:00:00.000Z";
    const second = await startRun(h.Deps, "openalex");
    expect(second.Outcome).toBe("skipped");
    expect(h.Count("ingestion_run")).toBe(1);
  });

  it("REQ-DATA-009: a run that outlives the timeout is closed as failed and a new one starts", async () => {
    scriptTwoPages();
    await runScheduled(h.Deps, OPENALEX_CRON);
    const stuck = h.Run();
    h.Clock.Now = "2026-10-30T13:00:00.000Z";
    const next = await startRun(h.Deps, "openalex");

    expect(next.Outcome).toBe("started");
    expect(h.Run(stuck["id"] as string)["status"]).toBe("failed");
    expect(h.Count("ingestion_run")).toBe(2);
  });

  it("REQ-DATA-009: an unknown cron expression starts nothing", async () => {
    expect(await runScheduled(h.Deps, "5 5 * * *")).toBeNull();
    expect(h.Count("ingestion_run")).toBe(0);
  });
});

describe("REQ-DATA-011: repeated delivery changes nothing", () => {
  function snapshot(harness: Harness) {
    const tables = ["publication", "source_record", "author", "authorship"] as const;
    const counts = Object.fromEntries(tables.map((t) => [t, harness.Count(t)]));
    const run = harness.Run();
    return {
      counts,
      runCounts: run["counts_json"],
      status: run["status"],
      pages: run["pages_done"],
    };
  }

  it("REQ-DATA-011: delivering every message twice gives the same stored state", async () => {
    scriptTwoPages();
    await runScheduled(h.Deps, OPENALEX_CRON);
    const deliveries = await h.Drain();
    const once = snapshot(h);

    const twice = createHarness();
    twice.SetOpenAlexPages([
      openAlexPage([makeWork(1), makeWork(2)], "cursor-2"),
      openAlexPage([makeWork(3)], null),
    ]);
    await runScheduled(twice.Deps, OPENALEX_CRON);
    const doubled = await twice.Drain({ Duplicate: true });

    expect(doubled).toBe(deliveries * 2);
    expect(snapshot(twice)).toEqual(once);
    expect(twice.OpenAlexRequests).toHaveLength(2);
  });

  it("REQ-DATA-011: the log marks each message completed after one claim", async () => {
    scriptTwoPages();
    await runScheduled(h.Deps, OPENALEX_CRON);
    await h.Drain({ Duplicate: true });

    const rows = h.Database.Raw.prepare(
      "SELECT message_id, status, attempts, dead_letter FROM queue_message_log ORDER BY message_id",
    ).all();
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => (r as { status: string }).status === "completed")).toBe(true);
    expect(rows.every((r) => (r as { attempts: number }).attempts === 1)).toBe(true);
  });

  it("REQ-DATA-011: a message carries IDs and a page number, nothing else", async () => {
    scriptTwoPages();
    await runScheduled(h.Deps, OPENALEX_CRON);
    await h.Drain();
    for (const { body } of h.Queue.sent) {
      expect(Object.keys((body as { Ids: object }).Ids).sort()).toEqual([
        "Page",
        "RunId",
        "Source",
      ]);
      expect(JSON.stringify(body).length).toBeLessThan(300);
    }
  });

  it("REQ-DATA-011: a page of a closed run is skipped and nothing is stored", async () => {
    scriptTwoPages();
    await runScheduled(h.Deps, OPENALEX_CRON);
    h.Clock.Now = "2026-10-30T13:00:00.000Z";
    await startRun(h.Deps, "openalex"); // closes the stuck run, starts another
    h.SetOpenAlexPages([openAlexPage([makeWork(9)], null)]);
    await h.Drain();

    expect(h.Count("publication")).toBe(1);
    expect(h.OpenAlexRequests).toHaveLength(1);
  });
});

describe("REQ-DATA-001: failed items are recorded and the next run covers them", () => {
  it("REQ-DATA-001: one broken work leaves the run partial and the rest is stored", async () => {
    h.SetOpenAlexPages([openAlexPage([makeWork(1), makeBrokenWork(), makeWork(2)], null)]);
    await runScheduled(h.Deps, OPENALEX_CRON);
    await h.Drain();

    const run = h.Run();
    expect(run["status"]).toBe("partial");
    expect(run["cursor"]).toBeNull();
    expect(JSON.parse(run["counts_json"] as string)).toMatchObject({ Created: 2, Failed: 1 });
    expect(JSON.parse(run["failures_json"] as string)).toHaveLength(1);
    expect(h.Count("publication")).toBe(2);
  });

  it("REQ-DATA-009: a partial run does not move the window, so the next run covers it again", async () => {
    h.SetOpenAlexPages([openAlexPage([makeWork(1)], null)]);
    await runScheduled(h.Deps, OPENALEX_CRON);
    await h.Drain();
    expect(h.Run()["cursor"]).toBe("2026-10-30");

    h.Clock.Now = "2026-10-31T06:00:00.000Z";
    h.SetOpenAlexPages([openAlexPage([makeWork(2), makeBrokenWork()], null)]);
    await runScheduled(h.Deps, OPENALEX_CRON);
    await h.Drain();
    expect(h.Run()["status"]).toBe("partial");

    h.Clock.Now = "2026-11-01T06:00:00.000Z";
    h.SetOpenAlexPages([openAlexPage([makeWork(2)], null)]);
    await runScheduled(h.Deps, OPENALEX_CRON);
    await h.Drain();
    // Still based on the last *successful* run (ended 2026-10-30), minus the overlap.
    expect(h.Run()["window_from"]).toBe("2026-10-28");
    expect(h.Run()["status"]).toBe("succeeded");
  });

  it("REQ-DATA-009: a run stops at the page cap and is marked partial", async () => {
    const capped = createHarness({ MaxPagesPerRun: 2 });
    capped.SetOpenAlexPages([
      openAlexPage([makeWork(1)], "c2"),
      openAlexPage([makeWork(2)], "c3"),
      openAlexPage([makeWork(3)], "c4"),
    ]);
    await runScheduled(capped.Deps, OPENALEX_CRON);
    await capped.Drain();

    const run = capped.Run();
    expect(run["pages_done"]).toBe(2);
    expect(run["status"]).toBe("partial");
    expect(run["failures_json"]).toContain("page cap of 2");
    expect(capped.Count("publication")).toBe(2);
  });
});

describe("REQ-DATA-011: dead-lettered messages are counted and can be replayed", () => {
  it("REQ-DATA-011: a page that keeps failing lands in the dead-letter queue and closes the run as failed", async () => {
    h.SetOpenAlexPages([
      new Error("OpenAlex down"),
      new Error("OpenAlex down"),
      new Error("OpenAlex down"),
      new Error("OpenAlex down"),
    ]);
    await runScheduled(h.Deps, OPENALEX_CRON);
    await h.Drain({ MaxRetries: 3 });

    expect(h.Queue.deadLettered).toHaveLength(1);
    const log = h.Database.Raw.prepare(
      "SELECT status, dead_letter, last_error FROM queue_message_log",
    ).get() as Record<string, unknown>;
    expect(log["status"]).toBe("dead-lettered");
    expect(log["dead_letter"]).toBe(1);
    const run = h.Run();
    expect(run["status"]).toBe("failed");
    expect(run["cursor"]).toBeNull();
    expect(JSON.parse(run["counts_json"] as string)).toMatchObject({ DeadLettered: 1 });
  });

  it("REQ-DATA-011: replaying a dead-lettered message finishes the run without duplicates", async () => {
    h.SetOpenAlexPages([new Error("x"), new Error("x"), new Error("x"), new Error("x")]);
    await runScheduled(h.Deps, OPENALEX_CRON);
    await h.Drain({ MaxRetries: 3 });
    const messageId = (h.Queue.deadLettered[0] as { MessageId: string }).MessageId;

    h.SetOpenAlexPages([openAlexPage([makeWork(1), makeWork(2)], null)]);
    expect(await replayDeadLetter(h.Deps, messageId)).toBe("replayed");
    await h.Drain();

    expect(h.Run()["status"]).toBe("succeeded");
    expect(h.Count("publication")).toBe(2);

    // A second replay of the same message is refused and changes nothing.
    expect(await replayDeadLetter(h.Deps, messageId)).toBe("not-dead-lettered");
    await h.Drain();
    expect(h.Count("publication")).toBe(2);
    expect(h.Count("queue_message_log")).toBe(1);
  });

  it("REQ-DATA-011: replaying an unknown message does nothing", async () => {
    expect(await replayDeadLetter(h.Deps, "fetch:nope:0")).toBe("unknown-message");
    expect(h.Queue.size).toBe(0);
  });

  it("REQ-DATA-011: a message that is not a valid envelope is retried, dead-lettered, and acknowledged", async () => {
    await h.Queue.send({ hello: "world" });
    await h.Drain({ MaxRetries: 1 });

    expect(h.Queue.deadLettered).toHaveLength(1);
    expect(h.Queue.size).toBe(0);
    expect(h.Count("queue_message_log")).toBe(0);
  });
});

describe("REQ-DATA-002: arXiv runs page by date and respect the delay", () => {
  it("REQ-DATA-002: pages continue while full and wait three seconds before the next page", async () => {
    const paged = createHarness({ PageSize: 2 });
    paged.SetArxivPages([
      arxivPage([makeEntry(1, "2026-10-29T10:00:00Z"), makeEntry(2, "2026-10-29T09:00:00Z")]),
      arxivPage([makeEntry(3, "2026-10-28T10:00:00Z")], 1),
    ]);
    await runScheduled(paged.Deps, ARXIV_CRON);
    await paged.Drain();

    expect(paged.ArxivRequests).toEqual([
      { Start: 0, MaxResults: 2 },
      { Start: 2, MaxResults: 2 },
    ]);
    expect(paged.Queue.sent.map((s) => s.delaySeconds)).toEqual([0, 3]);
    expect(paged.Count("publication")).toBe(3);
    expect(paged.Run()["status"]).toBe("succeeded");
  });

  it("REQ-DATA-002: an entry updated before the window ends the run and is not stored", async () => {
    const paged = createHarness({ PageSize: 2 });
    paged.SetArxivPages([
      arxivPage([makeEntry(1, "2026-10-29T10:00:00Z"), makeEntry(2, "2026-08-01T10:00:00Z")]),
      arxivPage([makeEntry(3, "2026-07-01T10:00:00Z")]),
    ]);
    await runScheduled(paged.Deps, ARXIV_CRON);
    await paged.Drain();

    expect(paged.ArxivRequests).toHaveLength(1);
    expect(paged.Count("publication")).toBe(1);
    expect(paged.Run()["status"]).toBe("succeeded");
  });
});

describe("REQ-TEST-003: scheduled ingestion tests never reach the network", () => {
  it("REQ-TEST-003: the global fetch stays unused through a full run", async () => {
    scriptTwoPages();
    await runScheduled(h.Deps, OPENALEX_CRON);
    await h.Drain();
    expect(fetch).not.toHaveBeenCalled();
  });
});
