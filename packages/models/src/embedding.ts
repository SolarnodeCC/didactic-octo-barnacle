import { writeRecord, type CallModelDeps } from "./call-model.js";
import { type ModelCallRunKind } from "./model-call.js";
import { classifyProviderError, type WorkersAiRunOptions } from "./workers-ai.js";

/**
 * Embedding calls (REQ-PROC-001, ADR 0010): like `callModel`, every call goes through AI
 * Gateway with run metadata (REQ-NFR-003), checks the day's budget before its first attempt
 * (REQ-NFR-005 AC2), retries provider errors with backoff, and writes one `model_call` record per
 * attempt (REQ-NFR-011). One call embeds a whole batch (ADR 0053).
 */

export type EmbeddingRequest = {
  RunKind: ModelCallRunKind;
  RunId: string;
  StepName: string;
  /** Exact, pinned model ID, for example `@cf/baai/bge-base-en-v1.5`. */
  Model: string;
  Texts: readonly string[];
};

export type EmbeddingResult =
  | { Ok: true; Vectors: number[][]; Attempts: number }
  | { Ok: false; Reason: "budget-exhausted"; Attempts: 0 }
  | { Ok: false; Reason: "invalid-output" | "provider-error"; Attempts: number; Errors: string[] };

/** The vectors and input tokens of an embedding response, or null for any other shape. */
export function parseEmbedding(
  response: unknown,
): { Vectors: number[][]; InputTokens: number | null } | null {
  if (response === null || typeof response !== "object") {
    return null;
  }
  const body = response as { data?: unknown; usage?: { prompt_tokens?: unknown } };
  if (
    !Array.isArray(body.data) ||
    !body.data.every(
      (row) => Array.isArray(row) && row.every((v) => typeof v === "number" && Number.isFinite(v)),
    )
  ) {
    return null;
  }
  const tokens = body.usage?.prompt_tokens;
  return {
    Vectors: body.data as number[][],
    InputTokens: typeof tokens === "number" ? tokens : null,
  };
}

/** About four characters per token, for a binding that reports no usage; the record is estimated. */
function estimateTokens(texts: readonly string[]): number {
  return texts.reduce((sum, text) => sum + Math.ceil(text.length / 4), 0);
}

export async function callEmbedding(
  deps: CallModelDeps,
  request: EmbeddingRequest,
): Promise<EmbeddingResult> {
  if (deps.Prices.Models[request.Model] === undefined) {
    throw new Error(
      `model ${request.Model} has no price in table ${deps.Prices.Version}; add it before use`,
    );
  }
  const day = deps.Now().toISOString().slice(0, 10);
  if (!(await deps.Usage.budgetAllows(day))) {
    return { Ok: false, Reason: "budget-exhausted", Attempts: 0 };
  }
  const identity = {
    RunKind: request.RunKind,
    RunId: request.RunId,
    StepName: request.StepName,
    Agent: null,
    PublicationId: null,
    CandidateId: null,
    Config: { Model: request.Model, PromptVersion: null },
  };
  const options: WorkersAiRunOptions = {
    gateway: { id: deps.GatewayId, metadata: { RunId: request.RunId, Step: request.StepName } },
  };
  const base = deps.BackoffBaseMs ?? 500;
  const max = deps.BackoffMaxMs ?? 30_000;
  let errors: string[] = [];
  let reason: "invalid-output" | "provider-error" = "provider-error";
  let attempts = 0;

  for (let attempt = 1; attempt <= deps.MaxAttempts; attempt += 1) {
    attempts = attempt;
    const started = Date.now();
    let response: unknown;
    try {
      response = await deps.Ai.run(request.Model, { text: [...request.Texts] }, options);
    } catch (error) {
      const failure = classifyProviderError(error);
      await writeRecord(
        deps,
        identity,
        attempt,
        { InputTokens: 0, OutputTokens: 0 },
        Date.now() - started,
        "provider-error",
      );
      reason = "provider-error";
      errors = [
        failure.Status === null ? failure.Message : `HTTP ${failure.Status}: ${failure.Message}`,
      ];
      if (!failure.Retryable || attempt === deps.MaxAttempts) {
        break;
      }
      const backoff = Math.min(max, base * 2 ** (attempt - 1));
      await deps.Sleep(
        failure.RetryAfterSeconds === null
          ? backoff
          : Math.min(max, Math.max(backoff, failure.RetryAfterSeconds * 1000)),
      );
      continue;
    }
    const parsed = parseEmbedding(response);
    const valid = parsed !== null && parsed.Vectors.length === request.Texts.length;
    await writeRecord(
      deps,
      identity,
      attempt,
      {
        InputTokens: parsed?.InputTokens ?? estimateTokens(request.Texts),
        OutputTokens: 0,
      },
      Date.now() - started,
      valid ? "ok" : "invalid-output",
    );
    if (valid) {
      return { Ok: true, Vectors: parsed.Vectors, Attempts: attempt };
    }
    reason = "invalid-output";
    errors = [
      parsed === null
        ? "the response holds no embedding vectors"
        : `expected ${request.Texts.length} vectors, got ${parsed.Vectors.length}`,
    ];
  }
  return { Ok: false, Reason: reason, Attempts: attempts, Errors: errors };
}

function hash(word: string): number {
  // FNV-1a, 32 bits: stable across runs and platforms.
  let value = 0x811c9dc5;
  for (let i = 0; i < word.length; i += 1) {
    value ^= word.charCodeAt(i);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value;
}

/**
 * A deterministic stand-in for an embedding model: a hashed bag of words, L2-normalised. Texts
 * that share words are close by cosine. For fakes and the CI recall test (ADR 0057); never a
 * measure of a real model.
 */
export function fakeEmbedding(text: string, dimensions = 768): number[] {
  const vector = new Array<number>(dimensions).fill(0);
  for (const word of text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
    const bucket = hash(word) % dimensions;
    vector[bucket] = (vector[bucket] ?? 0) + 1;
  }
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  return norm === 0 ? vector : vector.map((v) => v / norm);
}
