import {
  ABSTRACT_CONFIDENCE_CAP,
  CandidateRowSchema,
  ExtractionResultRowSchema,
  QueueMessageEnvelopeSchema,
  customerQuoteOverlaps,
  type CandidateRow,
  type ExtractionResultRow,
} from "@roi/models";

import { runExtractionStep } from "./step.js";
import { textKey } from "../documents/object-store.js";
import { checkBreaker, isPaused } from "../recovery/breaker.js";
import {
  addRunCountStatements,
  recordFailureStatement,
  type FailureClass,
} from "../recovery/redrive-repo.js";
import { claimMessage, completeStatement, markFailed } from "../queue/log.js";
import { type PipelineDeps } from "../queue/deps.js";
import { dailyRunId } from "../store/processing-run-repo.js";
import { type SqlDatabase } from "../store/sql.js";

export type ExtractionOutcome =
  | "extracted"
  | "already-extracted"
  | "not-admitted"
  | "retracted"
  | "no-publication"
  | "budget-deferred"
  | "model-failed"
  | "duplicate"
  | "dead-lettered";

type ExtractionConfig = NonNullable<PipelineDeps["Extraction"]>;

/**
 * Consumer of `publication.extract` (REQ-PROC-004, REQ-PROC-009, REQ-DATA-006 AC3). It reads
 * the full text when the document has `text-extracted`, and the abstract otherwise, and stores
 * one `extraction_result` with zero to `extraction.max_candidates_per_publication` candidates.
 * With abstract input, `Confidence` is capped at 0.7. One result per publication: a repeated
 * message, or one for a publication that already has a result, changes nothing (REQ-PROC-010
 * AC7). Only a publication that the daily admission accepted is extracted (ADR 0055).
 *
 * A step refused by the budget, paused by the breaker, or failing all its attempts completes the
 * message with the reason, writes no result, and records the failure in `redrive` (REQ-PROC-010
 * AC4, ADR 0063).
 */
export async function handleExtraction(
  deps: PipelineDeps,
  body: unknown,
): Promise<ExtractionOutcome> {
  const envelope = QueueMessageEnvelopeSchema.parse(body);
  const claim = await claimMessage(deps.Db, envelope, deps.Now());
  if (claim !== "claimed") {
    return claim;
  }
  try {
    const publicationId = envelope.Ids.PublicationId;
    if (envelope.Type !== "publication.extract" || publicationId === undefined) {
      throw new Error("publication.extract needs a PublicationId");
    }
    if (!deps.Extraction) {
      throw new Error("extraction is not configured in this Worker");
    }
    return await extract(deps, deps.Extraction, envelope.MessageId, publicationId);
  } catch (error) {
    await markFailed(deps.Db, envelope.MessageId, error, deps.Now());
    deps.Log?.("extraction.failed", {
      messageId: envelope.MessageId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

async function extract(
  deps: PipelineDeps,
  config: ExtractionConfig,
  messageId: string,
  publicationId: string,
): Promise<ExtractionOutcome> {
  const complete = (note: string | null) =>
    deps.Db.batch([completeStatement(deps.Db, messageId, deps.Now(), note)]);

  if (await hasResult(deps.Db, publicationId)) {
    await complete("already extracted");
    return "already-extracted";
  }
  const decision = await deps.Db.prepare(
    "SELECT accepted FROM triage_decision WHERE publication_id = ?",
  )
    .bind(publicationId)
    .first<{ accepted: number }>();
  if (decision?.accepted !== 1) {
    await complete("not admitted");
    return "not-admitted";
  }
  const publication = await deps.Db.prepare(
    "SELECT title, abstract, retracted FROM publication WHERE id = ?",
  )
    .bind(publicationId)
    .first<{ title: string; abstract: string | null; retracted: number }>();
  if (!publication) {
    await complete("no such publication");
    return "no-publication";
  }
  // A publication retracted after its admission is not extracted (REQ-DATA-008).
  if (publication.retracted === 1) {
    await complete("retracted");
    return "retracted";
  }
  const fullText = await readFullText(deps, publicationId);

  // Failures are recorded for the daily re-drive in the same batch that completes the
  // message (REQ-PROC-010, ADR 0063).
  const fail = (failureClass: FailureClass, note: string) =>
    deps.Db.batch([
      recordFailureStatement(
        deps.Db,
        {
          ItemKind: "publication",
          ItemId: publicationId,
          Step: "extraction",
          Class: failureClass,
          Model: config.Model.Model,
          PromptVersion: config.Model.PromptVersion,
        },
        deps.Now(),
        `rd_${deps.NewId()}`,
      ),
      completeStatement(deps.Db, messageId, deps.Now(), note),
    ]);

  // A paused step makes no call: the item waits as budget-deferred (REQ-PROC-010 AC6).
  if (await isPaused(deps.Db, "extraction")) {
    await fail("transient", "budget-deferred: the extraction step is paused");
    deps.Log?.("extraction.paused", { publicationId });
    return "budget-deferred";
  }

  const now = deps.Now();
  const runId = await dailyRunId(deps.Db, now.slice(0, 10), now, deps.NewId);
  const result = await runExtractionStep(config.Call, config.Model, {
    RunId: runId,
    PublicationId: publicationId,
    Title: publication.title,
    Abstract: publication.abstract ?? "",
    FullText: fullText,
    MaxCandidates: config.MaxCandidates,
    FullTextMaxChars: config.FullTextMaxChars,
    GenericCustomerTerms: config.GenericCustomerTerms,
  });
  if (!result.Ok) {
    if (result.Reason === "budget-exhausted") {
      // Picked up by the next day's cron (REQ-PROC-010 AC4).
      await fail("transient", "budget-deferred");
      deps.Log?.("extraction.budget_deferred", { publicationId });
      return "budget-deferred";
    }
    await fail(
      result.Reason === "invalid-output" ? "content" : "transient",
      `failed: ${result.Reason}: ${result.Errors.join("; ")}`,
    );
    if (result.Reason === "provider-error") {
      await checkBreaker(deps, "extraction");
    }
    deps.Log?.("extraction.model_failed", {
      publicationId,
      reason: result.Reason,
      attempts: result.Attempts,
    });
    return "model-failed";
  }

  const output = result.Output;
  const resultRow: ExtractionResultRow = ExtractionResultRowSchema.parse({
    Id: `ext_${deps.NewId()}`,
    PublicationId: publicationId,
    RunId: runId,
    Model: result.Model,
    PromptVersion: result.PromptVersion,
    InputMode: result.InputMode,
    // Abstract-only input caps Confidence (ADR 0014, contract conventions).
    Confidence:
      result.InputMode === "abstract"
        ? Math.min(output.Confidence, ABSTRACT_CONFIDENCE_CAP)
        : output.Confidence,
    Notes: output.Notes,
    CandidateCount: output.Candidates.length,
    CreatedAt: now,
  });
  const candidates: CandidateRow[] = output.Candidates.map((candidate) =>
    CandidateRowSchema.parse({
      ...candidate,
      Id: `cand_${deps.NewId()}`,
      PublicationId: publicationId,
      ExtractionResultId: resultRow.Id,
      HiddenReason: null,
      CreatedAt: now,
    }),
  );

  const counts = {
    Extracted: 1,
    [result.InputMode === "full-text" ? "ExtractedOnFullText" : "ExtractedOnAbstract"]: 1,
    ExtractedWithoutCandidate: candidates.length === 0 ? 1 : 0,
    CandidatesStored: candidates.length,
    CandidatesDropped: new Set(result.Dropped.map((item) => item.Index)).size,
    DroppedQuote: result.Dropped.filter((item) => item.Reason === "quote-not-found").length,
    DroppedGenericCustomer: result.Dropped.filter((item) => item.Reason === "generic-customer")
      .length,
    // Report-only check of ADR 0066: counted, never blocking.
    CustomerQuoteNoOverlap: candidates.filter(
      (candidate) => !customerQuoteOverlaps(candidate.Customer, candidate.CustomerQuote),
    ).length,
  };

  await deps.Db.batch([
    deps.Db.prepare(
      `INSERT INTO extraction_result (
        id, publication_id, run_id, model, prompt_version, input_mode, confidence, notes,
        candidate_count, quote_positions_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (publication_id) DO NOTHING`,
    ).bind(
      resultRow.Id,
      resultRow.PublicationId,
      resultRow.RunId,
      resultRow.Model,
      resultRow.PromptVersion,
      resultRow.InputMode,
      resultRow.Confidence,
      resultRow.Notes,
      resultRow.CandidateCount,
      JSON.stringify(result.QuotePositions),
      resultRow.CreatedAt,
    ),
    // Inserted only when this result row is the one stored, so a parallel duplicate adds no
    // candidates (REQ-PROC-010 AC7).
    ...candidates.map((candidate) =>
      deps.Db.prepare(
        `INSERT INTO candidate (
          id, publication_id, extraction_result_id, finding, evidence_quote, customer,
          customer_quote, why_now, why_now_quote, current_alternative, alternative_quote,
          hidden_reason, created_at
        )
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?
        WHERE EXISTS (SELECT 1 FROM extraction_result WHERE id = ?)`,
      ).bind(
        candidate.Id,
        candidate.PublicationId,
        candidate.ExtractionResultId,
        candidate.Finding,
        candidate.EvidenceQuote,
        candidate.Customer,
        candidate.CustomerQuote,
        candidate.WhyNow,
        candidate.WhyNowQuote,
        candidate.CurrentAlternative,
        candidate.AlternativeQuote,
        candidate.CreatedAt,
        resultRow.Id,
      ),
    ),
    ...addRunCountStatements(deps.Db, runId, counts),
    completeStatement(deps.Db, messageId, deps.Now()),
  ]);
  deps.Log?.("extraction.stored", {
    publicationId,
    inputMode: result.InputMode,
    candidates: candidates.length,
    dropped: result.Dropped.length,
    attempts: result.Attempts,
  });
  return "extracted";
}

async function hasResult(db: SqlDatabase, publicationId: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT 1 AS found FROM extraction_result WHERE publication_id = ?")
    .bind(publicationId)
    .first<{ found: number }>();
  return row !== null;
}

/**
 * The stored full text when the document has `text-extracted`, otherwise null, so the step
 * reads the abstract (REQ-DATA-006 AC3). A stored text that cannot be read throws, and the
 * queue retries the message.
 */
async function readFullText(deps: PipelineDeps, publicationId: string): Promise<string | null> {
  const document = await deps.Db.prepare(
    "SELECT id, status, extracted_text_r2_key FROM document WHERE publication_id = ?",
  )
    .bind(publicationId)
    .first<{ id: string; status: string; extracted_text_r2_key: string | null }>();
  if (document?.status !== "text-extracted") {
    return null;
  }
  const key = document.extracted_text_r2_key ?? textKey(document.id);
  const object = await deps.Documents.get(key);
  if (object === null) {
    throw new Error(`the extracted text ${key} is missing`);
  }
  return object.text();
}
