import { createHash } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
