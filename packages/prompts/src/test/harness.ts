import {
  FakeWorkersAi,
  callModel,
  type CallModelResult,
  type FakeReply,
  type ModelCallRecord,
  type ModelConfig,
  type ModelPrompt,
  type PriceTable,
} from "@roi/models";
import { type z } from "zod";

/** Runs one step through `callModel` against scripted replies; no live model (REQ-TEST-002 AC2). */

export const TEST_MODEL = "@cf/google/gemma-4-26b-a4b-it";

const prices: PriceTable = {
  Version: "2026-11-06",
  Source: "https://developers.cloudflare.com/workers-ai/platform/pricing/",
  UsdPerEur: 1.1165,
  ExchangeRateDate: "2026-11-06",
  Models: { [TEST_MODEL]: { InputUsdPerMillionTokens: 0.1, OutputUsdPerMillionTokens: 0.3 } },
};

export type StepRun<T> = {
  Result: CallModelResult<T>;
  Ai: FakeWorkersAi;
  Records: ModelCallRecord[];
};

export async function runStep<S extends z.ZodObject>(options: {
  Replies: FakeReply[];
  Config: ModelConfig;
  Prompt: ModelPrompt;
  Contract: S;
  StepName: string;
  MissingQuotes?: (output: z.infer<S>) => string[];
}): Promise<StepRun<z.infer<S>>> {
  const ai = new FakeWorkersAi(options.Replies);
  const records: ModelCallRecord[] = [];
  let id = 0;
  const result = await callModel(
    {
      Ai: ai,
      GatewayId: "roi-local",
      Usage: {
        budgetAllows: () => Promise.resolve(true),
        record: (record) => {
          records.push(record);
          return Promise.resolve();
        },
      },
      Prices: prices,
      MaxAttempts: 3,
      NewId: () => `mc_${(id += 1)}`,
      Now: () => new Date("2026-11-07T12:00:00Z"),
      Sleep: () => Promise.resolve(),
    },
    {
      RunKind: "processing",
      RunId: "run_1",
      StepName: options.StepName,
      Agent: null,
      PublicationId: "pub_1",
      CandidateId: null,
      Config: options.Config,
      Prompt: options.Prompt,
      Contract: options.Contract,
      ...(options.MissingQuotes ? { MissingQuotes: options.MissingQuotes } : {}),
    },
  );
  return { Result: result, Ai: ai, Records: records };
}

/** The same reply for every attempt, so a rejected output stays rejected. */
export function always(output: unknown): FakeReply[] {
  return [1, 2, 3].map(() => ({ Kind: "output" as const, Output: output }));
}
