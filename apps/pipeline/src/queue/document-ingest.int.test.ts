import { createHash } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { consumeBatch } from "./consume.js";
import { type AlertEvent } from "../alerts/types.js";
import { DEFAULT_INGEST_CONFIG } from "../config.js";
import { replayDeadLetter } from "./replay.js";
import { createPdfFetcher, PdfFetchError } from "../documents/safe-fetch.js";
import { runScheduled } from "../schedule/run-scheduled.js";
import {
  createHarness,
  makeEntry,
  makeWork,
  openAlexPage,
  pdfBytes,
  arxivPage,
  type Harness,
} from "../test/harness.js";
import { FakeQueue } from "../test/fake-queue.js";

const OPENALEX_CRON = "0 6 * * *";
const ARXIV_CRON = "30 7 * * *";

const URL_A = "https://repo.example.org/a.pdf";
const URL_B = "https://repo.example.org/b.pdf";

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

const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

function documents(harness: Harness) {
  return harness.Database.Raw.prepare(
    "SELECT d.publication_id, d.pdf_r2_key, d.content_hash, d.license, d.status FROM document d",
  ).all() as Array<Record<string, string>>;
}

function documentMessages(harness: Harness) {
  return harness.Queue.sent.filter((s) => (s.body as { Type: string }).Type === "document.ingest");
}

async function ingestPage(harness: Harness, works: ReturnType<typeof makeWork>[]) {
  harness.SetOpenAlexPages([openAlexPage(works, null)]);
  await runScheduled(harness.Deps, OPENALEX_CRON);
  await harness.Drain();
}

describe("REQ-DATA-004: PDF storage", () => {
  it("REQ-DATA-004: stores a PDF with a storable license once, under its content hash", async () => {
    const bytes = pdfBytes("paper one");
    h.SetPdfs({ [URL_A]: bytes });
    await ingestPage(h, [makeWork(1, { Pdf: { Url: URL_A, License: "cc-by" } })]);

    const hash = sha(bytes);
    expect([...h.Bucket.objects.keys()]).toEqual([`pdfs/${hash}.pdf`]);
    expect(h.Bucket.objects.get(`pdfs/${hash}.pdf`)).toMatchObject({
      contentType: "application/pdf",
      license: "cc-by",
    });
    expect(documents(h)).toEqual([
      expect.objectContaining({ content_hash: hash, license: "cc-by", status: "stored" }),
    ]);
    const publication = h.Database.Raw.prepare("SELECT id FROM publication").get() as {
      id: string;
    };
    expect(documents(h)[0]?.["publication_id"]).toBe(publication.id);
  });

  it("REQ-DATA-004: queues a PDF only for works with a PDF URL and a storable license", async () => {
    h.SetPdfs({ [URL_A]: pdfBytes("only this one") });
    await ingestPage(h, [
      makeWork(1, { Pdf: { Url: URL_A, License: "cc-by" } }),
      makeWork(2, { Pdf: { Url: URL_B, License: null } }),
      makeWork(3, { Pdf: { Url: URL_B, License: "arxiv-nonexclusive-distrib-1.0" } }),
      makeWork(4),
    ]);

    expect(documentMessages(h)).toHaveLength(1);
    expect(h.PdfRequests).toEqual([URL_A]);
    expect(h.Bucket.puts).toBe(1);
  });

  it("REQ-DATA-004: a publication without a PDF is still ingested and marked as having none", async () => {
    await ingestPage(h, [makeWork(1), makeWork(2, { Pdf: { Url: URL_A, License: null } })]);

    const rows = h.Database.Raw.prepare("SELECT has_storable_pdf FROM publication").all();
    expect(rows).toEqual([{ has_storable_pdf: 0 }, { has_storable_pdf: 0 }]);
    expect(documents(h)).toEqual([]);
    expect(h.Count("publication")).toBe(2);
  });

  it("REQ-DATA-004: an open access URL from another location does not qualify", async () => {
    // The license is for the primary location; `oa_url` may point to a different one.
    await ingestPage(h, [
      makeWork(1, {
        Pdf: { Url: null, License: "cc-by" },
        OaUrl: "https://other.example.org/x.pdf",
      }),
    ]);
    expect(documentMessages(h)).toHaveLength(0);
    expect(h.PdfRequests).toEqual([]);
  });

  it("REQ-DATA-004: a preprint under arXiv's own terms stays abstract-only", async () => {
    h.SetArxivPages([
      arxivPage([
        {
          ...makeEntry(1, "2026-10-29T10:00:00Z"),
          license: "arxiv-nonexclusive-distrib-1.0",
          pdfUrl: "https://arxiv.org/pdf/2410.00001",
        },
      ]),
    ]);
    await runScheduled(h.Deps, ARXIV_CRON);
    await h.Drain();

    expect(h.Count("publication")).toBe(1);
    expect(documentMessages(h)).toHaveLength(0);
    expect(documents(h)).toEqual([]);
  });

  it("REQ-DATA-004: two publications with the same file share one stored object", async () => {
    const same = pdfBytes("identical file");
    h.SetPdfs({ [URL_A]: same, [URL_B]: same });
    await ingestPage(h, [
      makeWork(1, { Pdf: { Url: URL_A, License: "cc-by" } }),
      makeWork(2, { Pdf: { Url: URL_B, License: "cc0" } }),
    ]);

    expect(h.Bucket.objects.size).toBe(1);
    expect(h.Bucket.puts).toBe(1);
    expect(documents(h)).toHaveLength(1);
    const note = h.Database.Raw.prepare(
      "SELECT last_error FROM queue_message_log WHERE last_error LIKE 'same file%'",
    ).get() as { last_error: string };
    expect(note.last_error).toMatch(/same file already stored for/);
  });

  it("REQ-DATA-004: delivering every message twice stores one object and one document", async () => {
    h.SetPdfs({ [URL_A]: pdfBytes("paper one") });
    h.SetOpenAlexPages([
      openAlexPage([makeWork(1, { Pdf: { Url: URL_A, License: "cc-by" } })], null),
    ]);
    await runScheduled(h.Deps, OPENALEX_CRON);
    await h.Drain({ Duplicate: true });

    expect(h.Bucket.puts).toBe(1);
    expect(documents(h)).toHaveLength(1);
    expect(h.PdfRequests).toEqual([URL_A]);
  });

  it("REQ-DATA-004: a later run over the same window queues no second document message", async () => {
    h.SetPdfs({ [URL_A]: pdfBytes("paper one") });
    const work = makeWork(1, { Pdf: { Url: URL_A, License: "cc-by" } });
    await ingestPage(h, [work]);

    h.Clock.Now = "2026-10-31T06:00:00.000Z";
    await ingestPage(h, [work]);

    expect(documentMessages(h)).toHaveLength(1);
    expect(h.PdfRequests).toEqual([URL_A]);
  });

  it("REQ-DATA-004: an object already in the bucket is not written again", async () => {
    const bytes = pdfBytes("paper one");
    await h.Bucket.put(`pdfs/${sha(bytes)}.pdf`, bytes);
    h.Bucket.puts = 0;
    h.SetPdfs({ [URL_A]: bytes });
    await ingestPage(h, [makeWork(1, { Pdf: { Url: URL_A, License: "cc-by" } })]);

    expect(h.Bucket.puts).toBe(0);
    expect(documents(h)).toHaveLength(1);
  });

  it("REQ-DATA-004: the message carries the publication ID and nothing else", async () => {
    h.SetPdfs({ [URL_A]: pdfBytes("paper one") });
    await ingestPage(h, [makeWork(1, { Pdf: { Url: URL_A, License: "cc-by" } })]);
    const [message] = documentMessages(h);
    expect(Object.keys((message?.body as { Ids: object }).Ids)).toEqual(["PublicationId"]);
  });
});

describe("REQ-DATA-010: license gate and safe fetching", () => {
  it("REQ-DATA-010: the consumer checks the license again and fetches nothing without one", async () => {
    await ingestPage(h, [
      makeWork(1, { Pdf: { Url: URL_A, License: "arxiv-nonexclusive-distrib-1.0" } }),
    ]);
    const publication = h.Database.Raw.prepare("SELECT id FROM publication").get() as {
      id: string;
    };

    await h.Queue.send({
      MessageId: `document:${publication.id}`,
      Type: "document.ingest",
      SchemaVersion: "1",
      Ids: { PublicationId: publication.id },
      Attempt: 0,
    });
    await h.Drain();

    expect(h.PdfRequests).toEqual([]);
    expect(documents(h)).toEqual([]);
    const log = h.Database.Raw.prepare(
      "SELECT status, last_error FROM queue_message_log WHERE type = 'document.ingest'",
    ).get() as Record<string, string>;
    expect(log["status"]).toBe("completed");
    expect(log["last_error"]).toMatch(/storable license/);
  });

  it("REQ-DATA-010: a file that is not a PDF is refused once and the reason is kept", async () => {
    h.SetPdfs({
      [URL_A]: new PdfFetchError("content type is not application/pdf", "not-pdf", true),
    });
    await ingestPage(h, [makeWork(1, { Pdf: { Url: URL_A, License: "cc-by" } })]);

    expect(h.PdfRequests).toEqual([URL_A]);
    expect(documents(h)).toEqual([]);
    expect(h.Bucket.puts).toBe(0);
    const log = h.Database.Raw.prepare(
      "SELECT status, last_error, attempts FROM queue_message_log WHERE type = 'document.ingest'",
    ).get() as Record<string, unknown>;
    expect(log).toMatchObject({ status: "completed", attempts: 1 });
    expect(log["last_error"]).toMatch(/not-pdf/);
    expect(h.Queue.deadLettered).toHaveLength(0);
  });

  it("REQ-DATA-010: a transient failure is retried, dead-lettered, and stored after a replay", async () => {
    const down = new PdfFetchError("HTTP 503", "http-status", false);
    h.SetPdfs({ [URL_A]: down });
    await ingestPage(h, [makeWork(1, { Pdf: { Url: URL_A, License: "cc-by" } })]);

    expect(h.PdfRequests).toHaveLength(4); // first try and three retries
    expect(h.Queue.deadLettered).toHaveLength(1);
    expect(documents(h)).toEqual([]);
    const run = h.Run();
    expect(run["status"]).toBe("succeeded"); // a PDF problem does not fail the ingestion run

    const messageId = (h.Queue.deadLettered[0] as { MessageId: string }).MessageId;
    h.SetPdfs({ [URL_A]: pdfBytes("paper one") });
    expect(await replayDeadLetter(h.Deps, messageId)).toBe("replayed");
    await h.Drain();

    expect(documents(h)).toHaveLength(1);
    expect(h.Bucket.puts).toBe(1);
  });

  it("REQ-DATA-011: a PDF host that answers 429 is retried after minutes, then dead-lettered", async () => {
    const limited = new PdfFetchError("HTTP 429", "http-status", false, 429, 100);
    h.SetPdfs({ [URL_A]: limited });
    await ingestPage(h, [makeWork(1, { Pdf: { Url: URL_A, License: "cc-by" } })]);

    expect(h.PdfRequests).toHaveLength(4); // first try and three retries
    expect(h.Queue.deadLettered).toHaveLength(1);
    // 5, 10, 20, and 40 minutes (a Retry-After of 100 s is shorter), each within the 20 %
    // jitter. The fourth delivery asks for a retry too, and that sends it to the dead letters.
    const delays = h.Queue.retries.map((retry) => retry.delaySeconds);
    expect(delays).toHaveLength(4);
    [300, 600, 1200, 2400].forEach((expected, index) => {
      expect(delays[index]).toBeGreaterThanOrEqual(Math.round(expected * 0.8));
      expect(delays[index]).toBeLessThanOrEqual(Math.round(expected * 1.2));
    });
  });

  it("REQ-DATA-010: the real fetcher refuses a non-https URL and an internal address without a request", async () => {
    const network = vi.fn(() => Promise.reject(new Error("must not be called")));
    const guarded = createHarness(
      {},
      {
        FetchPdf: createPdfFetcher({
          Fetch: network as unknown as typeof fetch,
          Limits: { MaxBytes: 1000, TimeoutMs: 100, MaxRedirects: 3, AllowedHosts: [] },
        }),
      },
    );
    await ingestPage(guarded, [
      makeWork(1, { Pdf: { Url: "http://insecure.example.org/a.pdf", License: "cc-by" } }),
      makeWork(2, { Pdf: { Url: "https://169.254.169.254/latest/meta-data", License: "cc-by" } }),
    ]);

    expect(network).not.toHaveBeenCalled();
    expect(documents(guarded)).toEqual([]);
    expect(guarded.Queue.deadLettered).toHaveLength(0);
    const notes = guarded.Database.Raw.prepare(
      "SELECT last_error FROM queue_message_log WHERE type = 'document.ingest'",
    ).all() as Array<{ last_error: string }>;
    expect(notes).toHaveLength(2);
    expect(notes.every((n) => n.last_error.startsWith("blocked-url"))).toBe(true);
  });
});

describe("REQ-TEST-003: document tests never reach the network", () => {
  it("REQ-TEST-003: the global fetch stays unused when PDFs are stored", async () => {
    h.SetPdfs({ [URL_A]: pdfBytes("paper one") });
    await ingestPage(h, [makeWork(1, { Pdf: { Url: URL_A, License: "cc-by" } })]);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("REQ-NFR-010: document messages are sent in batches", () => {
  it("REQ-NFR-010: a page with many PDFs sends its document messages in batches of at most 100", async () => {
    const works = Array.from({ length: 150 }, (_, i) =>
      makeWork(i + 1, { Pdf: { Url: `https://repo.example.org/${i + 1}.pdf`, License: "cc-by" } }),
    );
    h.SetOpenAlexPages([openAlexPage(works, null)]);
    await runScheduled(h.Deps, OPENALEX_CRON);
    // No PDF is scripted, so each document message fails once and is dead-lettered.
    await h.Drain({ MaxRetries: 0 });

    expect(h.Queue.batchSizes).toEqual([100, 50]);
    expect(documentMessages(h)).toHaveLength(150);
  });
});

describe("REQ-DATA-004: PDFs have their own queue", () => {
  function withDocumentQueue(harness: Harness) {
    const documents = new FakeQueue();
    const deps = { ...harness.Deps, DocumentQueue: documents };
    const drain = (queue: FakeQueue, maxRetries = 3) =>
      queue.drain({ MaxRetries: maxRetries, Consume: (batch) => consumeBatch(deps, batch) });
    return { documents, deps, drain };
  }

  it("REQ-DATA-004: document messages go to the document queue and never to the page queue", async () => {
    const { documents, deps, drain } = withDocumentQueue(h);
    h.SetPdfs({ [URL_A]: pdfBytes("a") });
    h.SetOpenAlexPages([
      openAlexPage([makeWork(1, { Pdf: { Url: URL_A, License: "cc-by" } })], null),
    ]);
    await runScheduled(deps, OPENALEX_CRON);
    await drain(h.Queue);

    expect(documentMessages(h)).toEqual([]);
    expect(documents.sent.map((s) => (s.body as { Type: string }).Type)).toEqual([
      "document.ingest",
    ]);
    expect(h.Run()["status"]).toBe("succeeded");
    expect(documents.size).toBe(1);

    await drain(documents);
    expect(documents.size).toBe(0);
    expect(documents.sent).toHaveLength(1);
    expect(documents.deadLettered).toEqual([]);
    expect(h.PdfRequests).toEqual([URL_A]);
  });

  it("REQ-DATA-011: a dead-lettered document is replayed to the document queue", async () => {
    const { documents, deps, drain } = withDocumentQueue(h);
    h.SetPdfs({ [URL_A]: new Error("upstream 503") });
    h.SetOpenAlexPages([
      openAlexPage([makeWork(1, { Pdf: { Url: URL_A, License: "cc-by" } })], null),
    ]);
    await runScheduled(deps, OPENALEX_CRON);
    await drain(h.Queue);
    await drain(documents, 0);
    expect(documents.deadLettered).toHaveLength(1);
    const messageId = (documents.deadLettered[0] as { MessageId: string }).MessageId;
    const pageMessages = h.Queue.sent.length;

    expect(await replayDeadLetter(deps, messageId)).toBe("replayed");
    expect(h.Queue.sent).toHaveLength(pageMessages);
    expect(documents.size).toBe(1);
  });
});

describe("REQ-NFR-019: PDF dead letters alert by daily rate, not one by one", () => {
  function collectAlerts(harness: Harness): AlertEvent[] {
    const alerts: AlertEvent[] = [];
    harness.Deps.Alert = (event) => {
      alerts.push(event);
      return Promise.resolve();
    };
    return alerts;
  }

  it("REQ-NFR-019: a dead-lettered PDF is recorded but raises no alert of its own", async () => {
    const alerts = collectAlerts(h);
    h.SetPdfs({ [URL_A]: new PdfFetchError("HTTP 503", "http-status", false, 503) });
    await ingestPage(h, [makeWork(1, { Pdf: { Url: URL_A, License: "cc-by" } })]);

    expect(h.Queue.deadLettered).toHaveLength(1);
    const log = h.Database.Raw.prepare(
      "SELECT status, last_error FROM queue_message_log WHERE type = 'document.ingest'",
    ).get() as Record<string, unknown>;
    expect(log["status"]).toBe("dead-lettered");
    expect(log["last_error"]).toMatch(/HTTP 503/);
    expect(h.Run()["status"]).toBe("succeeded");
    expect(alerts).toEqual([]);
  });

  it("REQ-NFR-019: one rate alert when a day's PDF dead-letter share crosses the threshold", async () => {
    const rated = createHarness({
      Pdf: {
        ...DEFAULT_INGEST_CONFIG.Pdf,
        DeadLetterAlertShare: 0.4,
        DeadLetterAlertMinMessages: 2,
      },
    });
    const alerts = collectAlerts(rated);
    rated.SetPdfs({
      [URL_A]: new PdfFetchError("HTTP 503", "http-status", false, 503),
      [URL_B]: pdfBytes("paper two"),
    });
    await ingestPage(rated, [
      makeWork(1, { Pdf: { Url: URL_A, License: "cc-by" } }),
      makeWork(2, { Pdf: { Url: URL_B, License: "cc-by" } }),
    ]);

    expect(rated.Queue.deadLettered).toHaveLength(1);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ Type: "pdf-dead-letter-rate", Source: "document.ingest" });
    expect(alerts[0]?.Summary).toMatch(/^1 of 2 PDF messages on \d{4}-\d{2}-\d{2} \(50\.0%\)/);
  });

  it("REQ-NFR-019: no rate alert while the day has fewer PDF messages than the minimum", async () => {
    const small = createHarness({
      Pdf: {
        ...DEFAULT_INGEST_CONFIG.Pdf,
        DeadLetterAlertShare: 0.4,
        DeadLetterAlertMinMessages: 3,
      },
    });
    const alerts = collectAlerts(small);
    small.SetPdfs({
      [URL_A]: new PdfFetchError("HTTP 503", "http-status", false, 503),
      [URL_B]: pdfBytes("paper two"),
    });
    await ingestPage(small, [
      makeWork(1, { Pdf: { Url: URL_A, License: "cc-by" } }),
      makeWork(2, { Pdf: { Url: URL_B, License: "cc-by" } }),
    ]);

    expect(small.Queue.deadLettered).toHaveLength(1);
    expect(alerts).toEqual([]);
  });

  it("REQ-NFR-019: a dead-lettered source page still raises a dead-letter alert", async () => {
    const alerts = collectAlerts(h);
    const down = () => new Error("OpenAlex down");
    h.SetOpenAlexPages([down(), down(), down(), down()]);
    await runScheduled(h.Deps, OPENALEX_CRON);
    await h.Drain({ MaxRetries: 3 });

    expect(h.Queue.deadLettered).toHaveLength(1);
    expect(alerts.map((alert) => alert.Type)).toContain("dead-letter");
  });

  it("REQ-DATA-010: a PDF host with an invalid certificate is completed without retries", async () => {
    const alerts = collectAlerts(h);
    h.SetPdfs({ [URL_A]: new PdfFetchError("HTTP 526", "http-status", true, 526) });
    await ingestPage(h, [makeWork(1, { Pdf: { Url: URL_A, License: "cc-by" } })]);

    expect(h.PdfRequests).toHaveLength(1);
    expect(h.Queue.deadLettered).toHaveLength(0);
    const log = h.Database.Raw.prepare(
      "SELECT status FROM queue_message_log WHERE type = 'document.ingest'",
    ).get() as Record<string, unknown>;
    expect(log["status"]).toBe("completed");
    expect(alerts).toEqual([]);
  });
});
