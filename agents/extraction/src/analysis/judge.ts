import { readFileSync } from "node:fs";
import { join } from "node:path";

import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { type ProblemDiscoveryOutput } from "@roi/models";
import { z } from "zod";

import { type FactJudge, type FactVerdicts } from "./eval.js";
import { ANALYSIS_EVALS_DIR } from "./golden-set.js";

/**
 * The model judge of the Problem Discovery eval (OQ-020, ADR 0049, ADR 0093): a Claude model,
 * called through AI Gateway, decides per required fact whether an output states it, following
 * a versioned rubric. It grades golden-set items only, which are public abstracts.
 */

export const JUDGE_MODEL = "claude-haiku-5-5";

/**
 * Claude Haiku 5.5 list prices in US dollars per million tokens, for prompts up to 100K tokens
 * (ADR 0093). The judge is not a Workers AI model, so it is not in the price table of
 * `infrastructure/cloudflare/prices`; its cost uses that table's exchange rate.
 */
export const JUDGE_PRICE = {
  InputUsdPerMillionTokens: 0.1,
  OutputUsdPerMillionTokens: 0.5,
} as const;

export type Rubric = { Version: string; Text: string };

/** The rubric next to the golden set; its version is the line `Rubric version: <id>`. */
export function loadRubric(dir: string = ANALYSIS_EVALS_DIR): Rubric {
  const text = readFileSync(join(dir, "problem-discovery.rubric.md"), "utf8");
  const version = /^Rubric version: (\S+)$/mu.exec(text)?.[1];
  if (version === undefined) {
    throw new Error("problem-discovery.rubric.md names no rubric version");
  }
  // The calibration record is for people; the judge reads the rules above it.
  return { Version: version, Text: text.split("\n## Calibration")[0]!.trim() };
}

const VerdictsSchema = z.object({
  Verdicts: z.array(
    z.object({
      Fact: z.number().int(),
      Present: z.boolean(),
      Reason: z.string(),
    }),
  ),
});

/** The JSON schema the judge must answer in (structured output). */
const VERDICTS_FORMAT = zodOutputFormat(VerdictsSchema);

/** The verdicts in the text blocks of a response, or null when they are not valid. */
function parseVerdicts(
  content: ReadonlyArray<{ type: string; text?: string }>,
): z.infer<typeof VerdictsSchema> | null {
  const text = content
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("");
  try {
    const result = VerdictsSchema.safeParse(JSON.parse(text));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/** One judge call, for the budget and the cost check against the gateway logs. */
export type JudgeCallRecord = {
  Id: string;
  RunId: string;
  EntryId: string;
  Model: string;
  RubricVersion: string;
  InputTokens: number;
  OutputTokens: number;
  CostEur: number;
  LatencyMs: number;
  Outcome: "ok" | "refusal" | "invalid-output" | "provider-error";
  GatewayLogId: string | null;
  CreatedAt: string;
};

/** The spend the judge shares with the model calls of a round. */
export type JudgeBudget = { allows(): boolean; add(eur: number): void };

export type JudgeOptions = {
  Client: Pick<Anthropic, "messages">;
  Rubric: Rubric;
  RunId: string;
  UsdPerEur: number;
  Budget: JudgeBudget;
  NewId: () => string;
  Now: () => Date;
  OnRecord?: (record: JudgeCallRecord) => void;
  Model?: string;
  /** Headers for AI Gateway, such as `cf-aig-metadata` with the run ID. */
  Headers?: Record<string, string>;
};

export function judgeUserText(facts: readonly string[], output: ProblemDiscoveryOutput): string {
  return [
    "Required facts:",
    ...facts.map((fact, index) => `${index + 1}. ${fact}`),
    "",
    "Problem Discovery output:",
    `Problem: ${output.Problem}`,
    `Customer: ${output.Customer.Segment}; role: ${output.Customer.Role}; industry: ${output.Customer.Industry}`,
    `PainLevel: ${output.PainLevel}`,
    `PainRationale: ${output.PainRationale}`,
  ].join("\n");
}

export function judgeCostEur(inputTokens: number, outputTokens: number, usdPerEur: number): number {
  const usd =
    (inputTokens * JUDGE_PRICE.InputUsdPerMillionTokens +
      outputTokens * JUDGE_PRICE.OutputUsdPerMillionTokens) /
    1_000_000;
  return usd / usdPerEur;
}

/** A `FactJudge` that asks a Claude model, one call per output. */
export function createClaudeJudge(options: JudgeOptions): FactJudge {
  const model = options.Model ?? JUDGE_MODEL;
  const system = [
    "You grade one output of a Problem Discovery agent against required facts, following this rubric.",
    "",
    options.Rubric.Text,
    "",
    'Answer with {"Verdicts": [{"Fact": <number of the fact>, "Present": true or false, "Reason": string}]}, one verdict per fact, in order.',
  ].join("\n");

  return async ({ EntryId, Facts, Output }): Promise<FactVerdicts> => {
    if (!options.Budget.allows()) {
      return { Ok: false, Error: "budget-exhausted" };
    }
    const started = options.Now();
    const record = (
      outcome: JudgeCallRecord["Outcome"],
      inputTokens: number,
      outputTokens: number,
      logId: string | null,
    ): void => {
      const cost = judgeCostEur(inputTokens, outputTokens, options.UsdPerEur);
      options.Budget.add(cost);
      options.OnRecord?.({
        Id: options.NewId(),
        RunId: options.RunId,
        EntryId,
        Model: model,
        RubricVersion: options.Rubric.Version,
        InputTokens: inputTokens,
        OutputTokens: outputTokens,
        CostEur: cost,
        LatencyMs: options.Now().getTime() - started.getTime(),
        Outcome: outcome,
        GatewayLogId: logId,
        CreatedAt: options.Now().toISOString(),
      });
    };
    try {
      // `create`, not `parse`: only the request's own promise has `withResponse`, which gives the
      // gateway log ID. The text is validated here against the same schema the model was given.
      const { data: response, response: raw } = await options.Client.messages
        .create(
          {
            model,
            max_tokens: 8000,
            system,
            messages: [{ role: "user", content: judgeUserText(Facts, Output) }],
            output_config: {
              effort: "medium",
              format: { type: "json_schema", schema: VERDICTS_FORMAT.schema },
            },
          },
          options.Headers === undefined ? undefined : { headers: options.Headers },
        )
        .withResponse();
      const logId = raw.headers.get("cf-aig-log-id");
      const { input_tokens: inputTokens, output_tokens: outputTokens } = response.usage;
      if (response.stop_reason === "refusal") {
        record("refusal", inputTokens, outputTokens, logId);
        return { Ok: false, Error: "refusal" };
      }
      const parsed = parseVerdicts(response.content);
      const verdicts = parsed?.Verdicts ?? [];
      const ordered =
        verdicts.length === Facts.length && verdicts.every((v, i) => v.Fact === i + 1);
      if (response.stop_reason !== "end_turn" || parsed === null || !ordered) {
        record("invalid-output", inputTokens, outputTokens, logId);
        return {
          Ok: false,
          Error: `invalid verdicts (stop reason ${String(response.stop_reason)})`,
        };
      }
      record("ok", inputTokens, outputTokens, logId);
      return { Ok: true, Present: verdicts.map((v) => v.Present) };
    } catch (error) {
      record("provider-error", 0, 0, null);
      return { Ok: false, Error: error instanceof Error ? error.message : String(error) };
    }
  };
}

/**
 * The Anthropic route of an AI Gateway (REQ-NFR-003). The key reaches the gateway from the
 * caller's environment: `EVAL_ANTHROPIC_API_KEY` in CI, or a network secret of the session.
 */
export function judgeGatewayBaseUrl(accountId: string, gatewayId: string): string {
  return `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayId}/anthropic`;
}

/** Agreement of the judge with the owner, over every fact both graded (calibration). */
export function judgeAgreement(
  owner: ReadonlyArray<readonly boolean[]>,
  judge: ReadonlyArray<readonly boolean[]>,
): { Agreed: number; Facts: number; Share: number } {
  let agreed = 0;
  let facts = 0;
  owner.forEach((verdicts, i) => {
    const other = judge[i];
    if (other === undefined || other.length !== verdicts.length) {
      throw new Error(`output ${i + 1}: the judge graded a different number of facts`);
    }
    verdicts.forEach((present, j) => {
      facts += 1;
      agreed += present === other[j] ? 1 : 0;
    });
  });
  return { Agreed: agreed, Facts: facts, Share: facts === 0 ? 0 : agreed / facts };
}
