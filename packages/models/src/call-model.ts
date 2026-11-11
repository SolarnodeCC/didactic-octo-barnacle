import { z } from "zod";

import { repairModelOutput, type RepairKind } from "./agent-contract.js";
import { type ModelCallRecord, type ModelCallRunKind } from "./model-call.js";
import { BUDGET_CURRENCY, estimateCost, type PriceTable, type TokenUsage } from "./price-table.js";
import {
  classifyProviderError,
  parseGeneration,
  type WorkersAiBinding,
  type WorkersAiRunOptions,
} from "./workers-ai.js";

/**
 * `callModel`: the only way to call a model (ADR 0003, REQ-NFR-003 AC1). One call runs one
 * step: budget check, Workers AI through AI Gateway, repair, validation, quote check, retries,
 * and one usage record per attempt (docs/kt/phase-2/design.md, "Model calls").
 */

/** How the contract is enforced (REQ-AGENT-010): the provider's JSON-schema mode, or prompt only. */
export type CallOutputMode = "json-schema" | "prompt-only";

/** Model, prompt version, and sampling settings of a step (`model.triage`, `model.extraction`). */
/**
 * The reasoning setting of a reasoning model, when not its default: thinking off, for a model
 * with an on/off switch (`chat_template_kwargs.enable_thinking`), or an effort level, for a
 * model with effort levels (`reasoning.effort`). Absent means the model's default (ADR 0086).
 */
export type ReasoningSetting = { Thinking: false } | { Effort: "low" | "medium" | "high" };

export type ModelConfig = {
  /** Exact, pinned model ID (REQ-AGENT-014), for example `@cf/zai-org/glm-4.7-flash`. */
  Model: string;
  PromptVersion: string | null;
  OutputMode: CallOutputMode;
  Temperature?: number;
  MaxTokens?: number;
  Reasoning?: ReasoningSetting;
};

export type ModelPrompt = {
  System: string;
  /** Holds the publication text inside the prompt's delimiters (REQ-NFR-006). */
  User: string;
};

/** Where usage records go and how the daily budget is read (REQ-NFR-005, REQ-NFR-011). */
export interface ModelUsageStore {
  /** True while the day's spend is below its limit, so a new step may start. */
  budgetAllows(day: string): Promise<boolean>;
  /** Writes the record and adds its cost to the day's spend, together. */
  record(record: ModelCallRecord): Promise<void>;
}

export type CallModelDeps = {
  Ai: WorkersAiBinding;
  /** The AI Gateway of the environment, `roi-<env>` (REQ-NFR-003). */
  GatewayId: string;
  Usage: ModelUsageStore;
  Prices: PriceTable;
  /** `model.max_attempts`: attempts per step, provider errors included (REQ-AGENT-009). */
  MaxAttempts: number;
  NewId: () => string;
  Now: () => Date;
  Sleep: (ms: number) => Promise<void>;
  /** First backoff after a provider error; it doubles per attempt. */
  BackoffBaseMs?: number;
  BackoffMaxMs?: number;
};

export type CallModelRequest<S extends z.ZodObject> = {
  RunKind: ModelCallRunKind;
  RunId: string;
  StepName: string;
  Agent: string | null;
  PublicationId: string | null;
  CandidateId: string | null;
  Config: ModelConfig;
  Prompt: ModelPrompt;
  /** The output contract from `packages/models`; sent to the model and always validated. */
  Contract: S;
  /**
   * Quote fields of a valid output that are not verbatim in the text the step sent, for
   * example `extractionMissingQuotes(output, text)`. Any entry fails the attempt (REQ-AGENT-008).
   */
  MissingQuotes?: (output: z.infer<S>) => string[];
};

export type CallModelResult<T> =
  | {
      Ok: true;
      Output: T;
      Model: string;
      PromptVersion: string | null;
      OutputMode: CallOutputMode;
      /** Attempts used, failed ones included (envelope `Attempts`). */
      Attempts: number;
      /** Repairs applied to the accepted output (envelope `Repairs`, REQ-AGENT-011). */
      Repairs: RepairKind[];
    }
  | { Ok: false; Reason: "budget-exhausted"; Attempts: 0 }
  | {
      Ok: false;
      Reason: "invalid-output" | "provider-error";
      Attempts: number;
      /** The validation or provider errors of the last attempt, stored with the failed step. */
      Errors: string[];
    };

const MAX_ERRORS = 20;

function validationErrors(error: z.ZodError): string[] {
  return error.issues
    .slice(0, MAX_ERRORS)
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`);
}

function retryMessage(errors: string[]): string {
  return [
    "Your previous answer did not match the required JSON schema or quoted text that is not in the publication.",
    "Fix these problems and answer again with JSON only:",
    ...errors.map((error) => `- ${error}`),
  ].join("\n");
}

function asText(output: unknown): string {
  return typeof output === "string" ? output : JSON.stringify(output ?? null);
}

export async function callModel<S extends z.ZodObject>(
  deps: CallModelDeps,
  request: CallModelRequest<S>,
): Promise<CallModelResult<z.infer<S>>> {
  const { Config: config } = request;
  if (deps.Prices.Models[config.Model] === undefined) {
    // Without a price the record could not carry a cost (REQ-NFR-011 AC2): refuse before calling.
    throw new Error(
      `model ${config.Model} has no price in table ${deps.Prices.Version}; add it before use`,
    );
  }
  const day = deps.Now().toISOString().slice(0, 10);
  // The budget is checked once, before the first attempt: a step that has started finishes
  // (REQ-NFR-005 AC2).
  if (!(await deps.Usage.budgetAllows(day))) {
    return { Ok: false, Reason: "budget-exhausted", Attempts: 0 };
  }

  const messages: Array<{ role: string; content: string }> = [
    { role: "system", content: request.Prompt.System },
    { role: "user", content: request.Prompt.User },
  ];
  const responseFormat =
    config.OutputMode === "json-schema"
      ? {
          type: "json_schema",
          json_schema: z.toJSONSchema(request.Contract, { unrepresentable: "any" }),
        }
      : undefined;
  const metadata: Record<string, string> = { RunId: request.RunId, Step: request.StepName };
  if (request.Agent !== null) {
    metadata.Agent = request.Agent;
  }
  const options: WorkersAiRunOptions = { gateway: { id: deps.GatewayId, metadata } };
  const base = deps.BackoffBaseMs ?? 500;
  const max = deps.BackoffMaxMs ?? 30_000;

  let attemptsMade = 0;
  let lastErrors: string[] = [];
  let lastReason: "invalid-output" | "provider-error" = "provider-error";

  for (let attempt = 1; attempt <= deps.MaxAttempts; attempt += 1) {
    attemptsMade = attempt;
    const inputs: Record<string, unknown> = { messages: [...messages] };
    if (responseFormat !== undefined) {
      inputs.response_format = responseFormat;
    }
    if (config.Temperature !== undefined) {
      inputs.temperature = config.Temperature;
    }
    if (config.MaxTokens !== undefined) {
      inputs.max_tokens = config.MaxTokens;
    }
    if (config.Reasoning !== undefined) {
      if ("Effort" in config.Reasoning) {
        inputs.reasoning = { effort: config.Reasoning.Effort };
      } else {
        inputs.chat_template_kwargs = { enable_thinking: false };
      }
    }

    const started = Date.now();
    let response: unknown;
    try {
      response = await deps.Ai.run(config.Model, inputs, options);
    } catch (error) {
      const failure = classifyProviderError(error);
      await writeRecord(
        deps,
        request,
        attempt,
        { InputTokens: 0, OutputTokens: 0 },
        Date.now() - started,
        "provider-error",
      );
      lastReason = "provider-error";
      lastErrors = [
        failure.Status === null ? failure.Message : `HTTP ${failure.Status}: ${failure.Message}`,
      ];
      if (!failure.Retryable || attempt === deps.MaxAttempts) {
        break;
      }
      const backoff = Math.min(max, base * 2 ** (attempt - 1));
      const wait =
        failure.RetryAfterSeconds === null
          ? backoff
          : Math.min(max, Math.max(backoff, failure.RetryAfterSeconds * 1000));
      await deps.Sleep(wait);
      continue;
    }

    const latency = Date.now() - started;
    const generation = parseGeneration(response);
    const repaired = repairModelOutput(generation.Output, request.Contract);
    let errors: string[];
    let output: z.infer<S> | null = null;
    if (!repaired.Ok) {
      errors = [repaired.Error];
    } else {
      const parsed = request.Contract.safeParse(repaired.Value);
      if (parsed.success) {
        output = parsed.data as z.infer<S>;
        const missing = request.MissingQuotes?.(output) ?? [];
        errors = missing.map((field) => `${field}: the quote is not verbatim in the text`);
      } else {
        errors = validationErrors(parsed.error);
      }
    }

    const ok = errors.length === 0 && output !== null;
    await writeRecord(deps, request, attempt, generation, latency, ok ? "ok" : "invalid-output");
    if (ok) {
      return {
        Ok: true,
        Output: output as z.infer<S>,
        Model: config.Model,
        PromptVersion: config.PromptVersion,
        OutputMode: config.OutputMode,
        Attempts: attempt,
        Repairs: repaired.Repairs,
      };
    }
    lastReason = "invalid-output";
    lastErrors = errors;
    // The retry carries the validation errors (REQ-AGENT-009 AC1).
    messages.push({ role: "assistant", content: asText(generation.Output).slice(0, 8_000) });
    messages.push({ role: "user", content: retryMessage(errors) });
  }

  return { Ok: false, Reason: lastReason, Attempts: attemptsMade, Errors: lastErrors };
}

async function writeRecord<S extends z.ZodObject>(
  deps: CallModelDeps,
  request: CallModelRequest<S>,
  attempt: number,
  usage: TokenUsage,
  latencyMs: number,
  outcome: ModelCallRecord["Outcome"],
): Promise<void> {
  // The binding returns no gateway cost, so the cost is estimated from the price table
  // (REQ-NFR-011 AC2, ADR 0054), with cached input at its own price (ADR 0078). A provider
  // error is billed nothing.
  const cost = estimateCost(deps.Prices, request.Config.Model, usage) ?? {
    Amount: 0,
    Currency: BUDGET_CURRENCY,
  };
  const logId = deps.Ai.aiGatewayLogId;
  await deps.Usage.record({
    Id: deps.NewId(),
    RunKind: request.RunKind,
    RunId: request.RunId,
    StepName: request.StepName,
    Agent: request.Agent,
    PublicationId: request.PublicationId,
    CandidateId: request.CandidateId,
    Model: request.Config.Model,
    PromptVersion: request.Config.PromptVersion,
    Attempt: attempt,
    InputTokens: usage.InputTokens,
    CachedInputTokens: Math.min(usage.CachedInputTokens ?? 0, usage.InputTokens),
    OutputTokens: usage.OutputTokens,
    LatencyMs: Math.max(0, Math.round(latencyMs)),
    Cost: cost,
    PriceTableVersion: deps.Prices.Version,
    Estimated: true,
    Outcome: outcome,
    GatewayRequestId: typeof logId === "string" && logId !== "" ? logId : null,
    CallKind: "model",
    SearchQuery: null,
    SearchResultCount: null,
    CreatedAt: deps.Now().toISOString(),
  });
}
