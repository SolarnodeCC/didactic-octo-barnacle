import { QueueMessageEnvelopeSchema } from "@roi/models";

import { claimMessage, completeStatement, markFailed } from "./log.js";
import { type PipelineDeps } from "./deps.js";
import { pdfKey, sha256Hex } from "../documents/object-store.js";
import { PdfFetchError } from "../documents/safe-fetch.js";
import {
  findDocumentByHash,
  findDocumentByPublication,
  findStorableSource,
} from "../store/document-repo.js";

export type DocumentOutcome =
  | "stored"
  | "already-stored"
  | "no-storable-pdf"
  | "refused"
  | "same-file-stored"
  | "duplicate"
  | "dead-lettered";

async function finish(
  deps: PipelineDeps,
  messageId: string,
  outcome: DocumentOutcome,
  note: string | null,
): Promise<DocumentOutcome> {
  await deps.Db.batch([completeStatement(deps.Db, messageId, deps.Now(), note)]);
  // The publication ID is the part of the message ID after `document:`.
  deps.Log?.("document.finished", {
    messageId,
    publicationId: messageId.replace(/^document:/, ""),
    outcome,
    note,
  });
  return outcome;
}

async function ingest(
  deps: PipelineDeps,
  publicationId: string,
  messageId: string,
): Promise<DocumentOutcome> {
  if (await findDocumentByPublication(deps.Db, publicationId)) {
    return finish(deps, messageId, "already-stored", null);
  }

  // The license is checked again here, not only when the message was queued: a PDF
  // is never stored without a recorded license that allows it (REQ-DATA-010 AC2).
  const source = await findStorableSource(deps.Db, publicationId);
  if (!source) {
    return finish(deps, messageId, "no-storable-pdf", "no PDF URL with a storable license");
  }

  let pdf;
  try {
    pdf = await deps.FetchPdf(source.Url);
  } catch (error) {
    if (error instanceof PdfFetchError && error.Permanent) {
      // Retrying cannot help. Only the host is logged, to tune the allowlist later.
      deps.Log?.("document.refused", {
        publicationId,
        code: error.Code,
        host: new URL(source.Url).hostname,
      });
      return finish(deps, messageId, "refused", `${error.Code}: ${error.message}`);
    }
    throw error;
  }

  const contentHash = await sha256Hex(pdf.Bytes);
  const sameFile = await findDocumentByHash(deps.Db, contentHash);
  if (sameFile) {
    // The same bytes belong to another publication: store them once (REQ-DATA-004 AC2).
    return finish(
      deps,
      messageId,
      "same-file-stored",
      `same file already stored for ${sameFile.publication_id}`,
    );
  }

  const key = pdfKey(contentHash);
  if (!(await deps.Documents.head(key))) {
    await deps.Documents.put(key, pdf.Bytes, {
      httpMetadata: { contentType: "application/pdf" },
      customMetadata: { license: source.License },
    });
  }

  const now = deps.Now();
  await deps.Db.batch([
    deps.Db.prepare(
      "INSERT INTO document (id, publication_id, pdf_r2_key, content_hash, license, status, stored_at) VALUES (?, ?, ?, ?, ?, 'stored', ?) ON CONFLICT DO NOTHING",
    ).bind(`doc_${deps.NewId()}`, publicationId, key, contentHash, source.License, now),
    completeStatement(deps.Db, messageId, now),
  ]);
  deps.Log?.("document.stored", { publicationId, contentHash, bytes: pdf.Bytes.byteLength });
  return "stored";
}

/**
 * Consumer of `document.ingest` (REQ-DATA-004). The PDF URL and license come from the
 * stored source record, never from the message. The file is stored once, under its
 * content hash, and linked to its publication. A repeated delivery finds the message
 * completed. Errors that can pass (timeout, 5xx) are thrown so the queue retries.
 */
export async function handleDocumentIngest(
  deps: PipelineDeps,
  body: unknown,
): Promise<DocumentOutcome> {
  const envelope = QueueMessageEnvelopeSchema.parse(body);
  const claim = await claimMessage(deps.Db, envelope, deps.Now());
  if (claim !== "claimed") {
    return claim;
  }

  const publicationId = envelope.Ids.PublicationId;
  try {
    if (envelope.Type !== "document.ingest" || publicationId === undefined) {
      throw new Error("document.ingest needs a PublicationId");
    }
    return await ingest(deps, publicationId, envelope.MessageId);
  } catch (error) {
    await markFailed(deps.Db, envelope.MessageId, error, deps.Now());
    deps.Log?.("document.failed", {
      messageId: envelope.MessageId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
