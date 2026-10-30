import { RunReportSchema } from "@roi/models";
import { describe, expect, it } from "vitest";

import { buildRunReport } from "./build-run-report.js";
import { sanitizeReason } from "./sanitize.js";
import { PdfFetchError } from "../documents/safe-fetch.js";
import { runScheduled } from "../schedule/run-scheduled.js";
import {
  createHarness,
  makeBrokenWork,
  makeWork,
  openAlexPage,
  pdfBytes,
  type Harness,
} from "../test/harness.js";

const CRON = "0 6 * * *";

async function run(h: Harness, pages: Parameters<Harness["SetOpenAlexPages"]>[0]) {
  h.SetOpenAlexPages(pages);
  await runScheduled(h.Deps, CRON);
  await h.Drain();
  return (h.Run()["id"] as string) ?? "";
}

describe("REQ-NFR-008: run report", () => {
  it("REQ-NFR-008: a finished run reports its counts, window, pages, and no failures", async () => {
    const h = createHarness();
    const id = await run(h, [openAlexPage([makeWork(1), makeWork(2)], null)]);
    const report = await buildRunReport(h.Database.Db, id, h.Clock.Now);

    expect(RunReportSchema.safeParse(report).success).toBe(true);
    expect(report).toMatchObject({
      RunId: id,
      Source: "openalex",
      Status: "succeeded",
      WindowFrom: "2026-09-30",
      PagesDone: 1,
      Counts: { Fetched: 2, Created: 2, Failed: 0 },
      Failures: [],
      DeadLetteredMessages: [],
    });
  });

  it("REQ-NFR-008: a failed item is listed with a short reason", async () => {
    const h = createHarness();
    const id = await run(h, [openAlexPage([makeWork(1), makeBrokenWork()], null)]);
    const report = await buildRunReport(h.Database.Db, id, h.Clock.Now);

    expect(report?.Status).toBe("partial");
    expect(report?.Counts.Failed).toBe(1);
    expect(report?.Failures).toHaveLength(1);
    expect((report?.Failures[0]?.Reason ?? "").length).toBeLessThanOrEqual(160);
  });

  it("REQ-NFR-008: counts incomplete records, flagged duplicates, and failed PDFs", async () => {
    const h = createHarness();
    const noAbstract = { ...makeWork(1), abstract_inverted_index: null };
    const first = makeWork(2);
    const lookalike = { ...makeWork(3), title: first.title };
    const withPdf = makeWork(4, {
      Pdf: { Url: "https://repo.example.org/a.pdf", License: "cc-by" },
    });
    h.SetPdfs({
      "https://repo.example.org/a.pdf": new PdfFetchError(
        "content type is not application/pdf",
        "not-pdf",
        true,
      ),
    });
    const id = await run(h, [openAlexPage([noAbstract, first, lookalike, withPdf], null)]);
    const report = await buildRunReport(h.Database.Db, id, h.Clock.Now);

    expect(report?.DataQuality).toEqual({
      IncompleteRecords: 1,
      DuplicatesFlagged: 1,
      FailedPdfs: 1,
    });
  });

  it("REQ-NFR-008: lists the dead-lettered messages of the run", async () => {
    const h = createHarness();
    const boom = () => new Error("OpenAlex down");
    const id = await run(h, [boom(), boom(), boom(), boom()]);
    const report = await buildRunReport(h.Database.Db, id, h.Clock.Now);

    expect(report?.Status).toBe("failed");
    expect(report?.Counts.DeadLettered).toBe(1);
    expect(report?.DeadLetteredMessages).toEqual([`fetch:${id}:0`]);
  });

  it("REQ-NFR-008: a PDF that works does not count as a failed PDF", async () => {
    const h = createHarness();
    h.SetPdfs({ "https://repo.example.org/a.pdf": pdfBytes("ok") });
    const id = await run(h, [
      openAlexPage(
        [makeWork(1, { Pdf: { Url: "https://repo.example.org/a.pdf", License: "cc-by" } })],
        null,
      ),
    ]);
    expect((await buildRunReport(h.Database.Db, id, h.Clock.Now))?.DataQuality.FailedPdfs).toBe(0);
  });

  it("REQ-NFR-008: an unknown run has no report", async () => {
    const h = createHarness();
    expect(await buildRunReport(h.Database.Db, "run_nope", h.Clock.Now)).toBeNull();
  });
});

describe("REQ-NFR-019: failure reasons are shortened before they leave the pipeline", () => {
  it("REQ-NFR-019: replaces links and long tokens, collapses whitespace, and caps the length", () => {
    const text = sanitizeReason(
      "failed   fetching https://api.example.org/x?token=abc123  with key ghp_abcdefghijklmnopqrstuvwxyz0123456789 " +
        "and a very long tail ".repeat(20),
    );
    expect(text).not.toContain("https://");
    expect(text).not.toContain("ghp_abcdefghijklmnop");
    expect(text).toContain("[link]");
    expect(text).toContain("[token]");
    expect(text).not.toMatch(/\s{2,}/);
    expect(text.length).toBeLessThanOrEqual(160);
  });

  it("REQ-NFR-019: leaves a short plain reason as it is", () => {
    expect(sanitizeReason("UNIQUE constraint failed")).toBe("UNIQUE constraint failed");
  });
});
