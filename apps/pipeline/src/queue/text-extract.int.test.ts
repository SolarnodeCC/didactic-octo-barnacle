import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { consumeBatch } from "./consume.js";
import { replayDeadLetter } from "./replay.js";
import { textExtractEnvelope, type PipelineDeps } from "./deps.js";
import { handleTextExtract } from "./text-extract.js";
import {
  corruptPdf,
  longPdf,
  scannedPdf,
  TWO_COLUMN_PHRASES,
  twoColumnPaperPdf,
} from "../documents/fixture-pdfs.js";
import { PDF_TEXT_EXTRACTOR } from "../documents/pdf-text.js";
import { queueTextBackfill, runScheduled } from "../schedule/run-scheduled.js";
import { createHarness, makeWork, openAlexPage, type Harness } from "../test/harness.js";

const OPENALEX_CRON = "0 6 * * *";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("REQ-TEST-003: unexpected network fetch"))),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

type DocumentRow = {
  id: string;
  publication_id: string;
  status: string;
  extracted_text_r2_key: string | null;
  extractor_version: string | null;
  failure_reason: string | null;
};

function documents(h: Harness): DocumentRow[] {
  return h.Database.Raw.prepare(
    "SELECT id, publication_id, status, extracted_text_r2_key, extractor_version, failure_reason FROM document ORDER BY stored_at, id",
  ).all() as DocumentRow[];
}

function textMessages(h: Harness) {
  return h.Queue.sent.filter(
    (sent) => (sent.body as { Type: string }).Type === "document.extract_text",
  );
}

function storedText(h: Harness, key: string): string {
  const object = h.Bucket.objects.get(key);
  return object ? new TextDecoder().decode(object.bytes) : "";
}

/** Ingests one page of works, each with its own PDF, and runs every queued message. */
async function ingest(h: Harness, pdfs: Uint8Array[]): Promise<void> {
  const files: Record<string, Uint8Array> = {};
  const works = pdfs.map((bytes, index) => {
    const url = `https://repo.example.org/${index + 1}.pdf`;
    files[url] = bytes;
    return makeWork(index + 1, { Pdf: { Url: url, License: "cc-by" } });
  });
  h.SetPdfs(files);
  h.SetOpenAlexPages([openAlexPage(works, null)]);
  await runScheduled(h.Deps, OPENALEX_CRON);
  await h.Drain();
}

describe("REQ-DATA-006: full-text extraction of stored PDFs", () => {
  it("REQ-DATA-006: stores the text of a stored PDF with the extractor name and version", async () => {
    const h = createHarness({}, { Text: {} });
    await ingest(h, [twoColumnPaperPdf(2)]);

    const [document] = documents(h);
    expect(document).toMatchObject({
      status: "text-extracted",
      extracted_text_r2_key: `texts/${document?.id}.txt`,
      extractor_version: PDF_TEXT_EXTRACTOR,
      failure_reason: null,
    });
    const text = storedText(h, `texts/${document?.id}.txt`);
    for (const phrase of TWO_COLUMN_PHRASES) {
      expect(text).toContain(phrase);
    }
    expect(h.Bucket.objects.get(`texts/${document?.id}.txt`)).toMatchObject({
      contentType: "text/plain; charset=utf-8",
      license: "cc-by",
    });
    expect(textMessages(h)).toHaveLength(1);
  });

  it("REQ-DATA-006: a corrupt file, a scan, and a file over the page limit are marked failed and keep the abstract", async () => {
    const h = createHarness({}, { Text: { Limits: { MaxPages: 3 } } });
    await ingest(h, [corruptPdf(), scannedPdf(), longPdf(4)]);

    const rows = documents(h);
    expect(rows.map((row) => row.status)).toEqual(["text-failed", "text-failed", "text-failed"]);
    expect(rows.map((row) => row.failure_reason?.split(":")[0]).sort()).toEqual([
      "no-text",
      "too-many-pages",
      "unreadable",
    ]);
    expect(rows.every((row) => row.extracted_text_r2_key === null)).toBe(true);
    expect([...h.Bucket.objects.keys()].filter((key) => key.startsWith("texts/"))).toEqual([]);
    // The abstracts the publications are read from stay as they were.
    const abstracts = h.Database.Raw.prepare(
      "SELECT COUNT(*) AS n FROM publication WHERE abstract IS NOT NULL AND abstract != ''",
    ).get() as { n: number };
    expect(abstracts.n).toBe(3);
    // A failed file completes its message: a retry cannot change the outcome.
    expect(h.Queue.deadLettered).toEqual([]);
  });

  it("REQ-DATA-006: a file over the byte limit is refused before it is loaded", async () => {
    const extract = vi.fn();
    const h = createHarness({}, { Text: { Extract: extract, Limits: { MaxPdfBytes: 100 } } });
    await ingest(h, [twoColumnPaperPdf(2)]);

    expect(extract).not.toHaveBeenCalled();
    expect(documents(h)[0]).toMatchObject({ status: "text-failed" });
    expect(documents(h)[0]?.failure_reason).toMatch(
      /^too-large: \d+ bytes, more than the limit of 100$/,
    );
  });

  it("REQ-DATA-006: a repeated message changes nothing", async () => {
    const h = createHarness({}, { Text: {} });
    await ingest(h, [twoColumnPaperPdf(2)]);
    const before = { rows: documents(h), puts: h.Bucket.puts };

    const [document] = before.rows;
    const envelope = textExtractEnvelope(document?.publication_id ?? "", document?.id ?? "");
    expect(await handleTextExtract(h.Deps, envelope)).toBe("duplicate");
    expect(documents(h)).toEqual(before.rows);
    expect(h.Bucket.puts).toBe(before.puts);
  });

  it("REQ-DATA-006: delivering every message twice stores each text once", async () => {
    const h = createHarness({}, { Text: {} });
    const files = { "https://repo.example.org/1.pdf": twoColumnPaperPdf(3) };
    h.SetPdfs(files);
    h.SetOpenAlexPages([
      openAlexPage(
        [makeWork(1, { Pdf: { Url: "https://repo.example.org/1.pdf", License: "cc-by" } })],
        null,
      ),
    ]);
    await runScheduled(h.Deps, OPENALEX_CRON);
    await h.Drain({ Duplicate: true });

    expect(documents(h).map((row) => row.status)).toEqual(["text-extracted"]);
    expect([...h.Bucket.objects.keys()].filter((key) => key.startsWith("texts/"))).toHaveLength(1);
  });

  it("REQ-DATA-006: a storage error is retried, and the text is stored on a later delivery", async () => {
    const h = createHarness({}, { Text: {} });
    h.SetPdfs({ "https://repo.example.org/1.pdf": twoColumnPaperPdf(2) });
    h.SetOpenAlexPages([
      openAlexPage(
        [makeWork(1, { Pdf: { Url: "https://repo.example.org/1.pdf", License: "cc-by" } })],
        null,
      ),
    ]);
    await runScheduled(h.Deps, OPENALEX_CRON);
    // Run the page and the PDF, but fail the first read of the stored file.
    const failOnce = { done: false };
    const get = h.Bucket.get.bind(h.Bucket);
    h.Bucket.get = (key) => {
      if (key.startsWith("pdfs/") && !failOnce.done) {
        failOnce.done = true;
        return Promise.reject(new Error("storage unavailable"));
      }
      return get(key);
    };
    await h.Drain();

    expect(failOnce.done).toBe(true);
    expect(h.Queue.retries.length).toBeGreaterThan(0);
    expect(documents(h)[0]?.status).toBe("text-extracted");
  });

  it("REQ-DATA-006: with processing off, a stored PDF gets no text message", async () => {
    const h = createHarness({}, { Text: { Send: false } });
    await ingest(h, [twoColumnPaperPdf(2)]);

    expect(textMessages(h)).toEqual([]);
    expect(documents(h)[0]?.status).toBe("stored");
  });

  it("REQ-DATA-006: the next ingestion start queues text for PDFs stored before extraction was on", async () => {
    const h = createHarness({}, { Text: { Send: false, Limits: { BackfillPerRun: 2 } } });
    await ingest(h, [twoColumnPaperPdf(2), twoColumnPaperPdf(3), twoColumnPaperPdf(4)]);
    expect(documents(h).map((row) => row.status)).toEqual(["stored", "stored", "stored"]);

    // Processing is turned on: the same database, now with a text queue.
    const text = h.Deps.Text;
    if (!text) {
      throw new Error("the harness has no text extraction");
    }
    const on: PipelineDeps = { ...h.Deps, Text: { ...text, Queue: h.Queue } };
    const drain = () =>
      h.Queue.drain({ MaxRetries: 3, Consume: (batch) => consumeBatch(on, batch) });

    expect(await queueTextBackfill(on)).toBe(2);
    await drain();
    expect(documents(h).filter((row) => row.status === "text-extracted")).toHaveLength(2);

    expect(await queueTextBackfill(on)).toBe(1);
    await drain();
    expect(documents(h).map((row) => row.status)).toEqual([
      "text-extracted",
      "text-extracted",
      "text-extracted",
    ]);
    expect(await queueTextBackfill(on)).toBe(0);
  });

  it("REQ-DATA-011: a dead-lettered text message is replayed to the text queue", async () => {
    const h = createHarness({}, { Text: {} });
    await ingest(h, [twoColumnPaperPdf(2)]);
    const [document] = documents(h);
    const messageId = `text:${document?.id}`;
    h.Database.Raw.prepare(
      "UPDATE queue_message_log SET status = 'dead-lettered', dead_letter = 1 WHERE message_id = ?",
    ).run(messageId);
    const sentBefore = textMessages(h).length;

    expect(await replayDeadLetter(h.Deps, messageId)).toBe("replayed");
    expect(textMessages(h)).toHaveLength(sentBefore + 1);
    // The document is already final, so the replay changes nothing.
    await h.Drain();
    expect(documents(h)[0]).toEqual(document);
  });
});
