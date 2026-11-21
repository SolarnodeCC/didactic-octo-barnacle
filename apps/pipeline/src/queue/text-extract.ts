import { QueueMessageEnvelopeSchema } from "@roi/models";

import { claimMessage, completeStatement, markFailed } from "./log.js";
import { type PipelineDeps } from "./deps.js";
import { textKey } from "../documents/object-store.js";
import { PDF_TEXT_EXTRACTOR, PdfTextError } from "../documents/pdf-text.js";
import { FINAL_TEXT_STATES, findDocumentById } from "../store/document-repo.js";

export type TextOutcome =
  | "text-extracted"
  | "text-failed"
  | "already-final"
  | "no-document"
  | "duplicate"
  | "dead-lettered";

const MAX_REASON_LENGTH = 300;

/**
 * Consumer of `document.extract_text` (REQ-DATA-006, ADR 0009). It reads the stored PDF of
 * one document, extracts its text with unpdf, stores the text in R2 under
 * `texts/<documentId>.txt`, and records the extractor name and version on the document
 * (AC1). A file over the byte or page limit, a file that does not parse, or one with no text
 * layer is marked `text-failed` with its reason, and the publication keeps its abstract
 * (AC2). Those outcomes complete the message, because a retry cannot change them; a storage
 * or database error is thrown so the queue retries it. A repeated delivery finds the
 * message completed, or the document already in a final state, and changes nothing.
 */
export async function handleTextExtract(deps: PipelineDeps, body: unknown): Promise<TextOutcome> {
  const envelope = QueueMessageEnvelopeSchema.parse(body);
  const claim = await claimMessage(deps.Db, envelope, deps.Now());
  if (claim !== "claimed") {
    return claim;
  }
  try {
    const documentId = envelope.Ids.DocumentId;
    if (envelope.Type !== "document.extract_text" || documentId === undefined) {
      throw new Error("document.extract_text needs a DocumentId");
    }
    if (!deps.Text) {
      throw new Error("text extraction is not configured in this Worker");
    }
    return await extract(deps, deps.Text, envelope.MessageId, documentId);
  } catch (error) {
    await markFailed(deps.Db, envelope.MessageId, error, deps.Now());
    deps.Log?.("text.failed", {
      messageId: envelope.MessageId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

async function extract(
  deps: PipelineDeps,
  text: NonNullable<PipelineDeps["Text"]>,
  messageId: string,
  documentId: string,
): Promise<TextOutcome> {
  const document = await findDocumentById(deps.Db, documentId);
  if (!document) {
    await deps.Db.batch([completeStatement(deps.Db, messageId, deps.Now(), "no such document")]);
    return "no-document";
  }
  if ((FINAL_TEXT_STATES as readonly string[]).includes(document.status)) {
    await deps.Db.batch([completeStatement(deps.Db, messageId, deps.Now(), null)]);
    return "already-final";
  }

  // The size comes from R2 before the file is loaded, so a file over the limit never
  // enters the Worker's memory (ADR 0009).
  const head = await deps.Documents.head(document.pdf_r2_key);
  if (!head) {
    return fail(deps, messageId, documentId, "missing", "the stored PDF is missing");
  }
  if (head.size > text.Limits.MaxPdfBytes) {
    return fail(
      deps,
      messageId,
      documentId,
      "too-large",
      `${head.size} bytes, more than the limit of ${text.Limits.MaxPdfBytes}`,
    );
  }
  const object = await deps.Documents.get(document.pdf_r2_key);
  if (!object) {
    return fail(deps, messageId, documentId, "missing", "the stored PDF is missing");
  }
  const bytes = new Uint8Array(await object.arrayBuffer());

  let extracted;
  try {
    extracted = await text.Extract(bytes, text.Limits);
  } catch (error) {
    if (error instanceof PdfTextError) {
      return fail(deps, messageId, documentId, error.Code, error.message);
    }
    throw error;
  }

  const key = textKey(documentId);
  await deps.Documents.put(key, new TextEncoder().encode(extracted.Text), {
    httpMetadata: { contentType: "text/plain; charset=utf-8" },
    // The text carries the license of the PDF it was read from (REQ-DATA-010).
    customMetadata: { license: document.license, extractor: PDF_TEXT_EXTRACTOR },
  });
  const now = deps.Now();
  await deps.Db.batch([
    deps.Db.prepare(
      "UPDATE document SET status = 'text-extracted', extracted_text_r2_key = ?, extractor_version = ?, failure_reason = NULL WHERE id = ?",
    ).bind(key, PDF_TEXT_EXTRACTOR, documentId),
    completeStatement(deps.Db, messageId, now),
  ]);
  deps.Log?.("text.extracted", {
    documentId,
    publicationId: document.publication_id,
    pages: extracted.Pages,
    chars: extracted.Text.length,
  });
  return "text-extracted";
}

/**
 * Marks the document `text-failed` and completes the message: the file cannot give text, and
 * the publication is read from its abstract (REQ-DATA-006 AC2). The reason holds a code and
 * our own words, never text of the file.
 */
async function fail(
  deps: PipelineDeps,
  messageId: string,
  documentId: string,
  code: string,
  detail: string,
): Promise<TextOutcome> {
  const reason = `${code}: ${detail}`.slice(0, MAX_REASON_LENGTH);
  await deps.Db.batch([
    deps.Db.prepare(
      "UPDATE document SET status = 'text-failed', extractor_version = ?, failure_reason = ? WHERE id = ?",
    ).bind(PDF_TEXT_EXTRACTOR, reason, documentId),
    completeStatement(deps.Db, messageId, deps.Now(), reason),
  ]);
  deps.Log?.("text.not_extracted", { documentId, code });
  return "text-failed";
}
