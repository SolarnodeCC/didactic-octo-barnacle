import {
  applyExtractionChecks,
  callModel,
  extractionFailureMessage,
  extractionItemChecks,
  type CallModelDeps,
  type ExtractionItemFailure,
  type ExtractionOutput,
  type InputMode,
  type ModelConfig,
} from "@roi/models";
import {
  EXTRACTION_PROMPT_VERSION,
  EXTRACTION_SAMPLING,
  buildExtractionPrompt,
  extractionContract,
  modelConfig,
} from "@roi/prompts";

export type ExtractionStepInput = {
  RunId: string;
  /** Null only for the breaker's probe call, which reads no stored publication. */
  PublicationId: string | null;
  Title: string;
  Abstract: string;
  /** Extracted full text when the document has `text-extracted`, otherwise null. */
  FullText: string | null;
  MaxCandidates: number;
  FullTextMaxChars: number;
  GenericCustomerTerms: readonly string[];
};

export type ExtractionStepResult =
  | {
      Ok: true;
      /** Kept candidates, each quote the matched span of the text that was sent (ADR 0064). */
      Output: ExtractionOutput;
      /** Candidates dropped on the last attempt (envelope `Dropped`, REQ-PROC-009 AC7). */
      Dropped: ExtractionItemFailure[];
      /** Kept quotes by where they start in the text sent, in tenths of its length (ADR 0071). */
      QuotePositions: number[];
      InputMode: InputMode;
      Model: string;
      PromptVersion: string;
      Attempts: number;
    }
  | { Ok: false; Reason: "budget-exhausted"; Attempts: 0 }
  | { Ok: false; Reason: "invalid-output" | "provider-error"; Attempts: number; Errors: string[] };

/**
 * The model part of extraction (REQ-PROC-004, REQ-PROC-009): `extraction@4` reads the full text,
 * cut at `extraction.full_text_max_chars`, or the abstract, and `callModel` validates the
 * contract, checks each quote against exactly the text that was sent and each customer against
 * the generic terms, and retries with the failing candidate named. When the last attempt fails
 * only those checks, the failing candidates are dropped and the others kept (ADR 0064, ADR 0066).
 * Like the triage step, it lives in the pipeline so the Worker bundle stays free of the
 * benchmark command's dependencies; the checks themselves are shared from `packages/models`.
 */
export async function runExtractionStep(
  deps: CallModelDeps,
  model: ModelConfig,
  input: ExtractionStepInput,
): Promise<ExtractionStepResult> {
  if (model.PromptVersion !== EXTRACTION_PROMPT_VERSION) {
    throw new Error(
      `model.extraction names prompt ${String(model.PromptVersion)}, but the pipeline has ${EXTRACTION_PROMPT_VERSION}`,
    );
  }
  const config: ModelConfig = {
    ...modelConfig(model.Model, EXTRACTION_PROMPT_VERSION, EXTRACTION_SAMPLING, model.OutputMode),
    ...(model.Reasoning ? { Reasoning: model.Reasoning } : {}),
  };
  const built = buildExtractionPrompt({
    Title: input.Title,
    Abstract: input.Abstract,
    FullText: input.FullText,
    MaxCandidates: input.MaxCandidates,
    FullTextMaxChars: input.FullTextMaxChars,
  });
  const terms = input.GenericCustomerTerms;
  const result = await callModel(deps, {
    RunKind: "processing",
    RunId: input.RunId,
    StepName: "extraction",
    Agent: null,
    PublicationId: input.PublicationId,
    CandidateId: null,
    Config: config,
    Prompt: built.Prompt,
    Contract: extractionContract(input.MaxCandidates),
    ItemChecks: (output) =>
      extractionItemChecks(output, built.QuoteText, terms).map((failure) =>
        extractionFailureMessage(output, failure),
      ),
  });
  let accepted: ExtractionOutput;
  if (result.Ok) {
    accepted = result.Output;
  } else if (result.Reason === "budget-exhausted") {
    return { Ok: false, Reason: "budget-exhausted", Attempts: 0 };
  } else if (result.Checked === undefined) {
    return { Ok: false, Reason: result.Reason, Attempts: result.Attempts, Errors: result.Errors };
  } else {
    // The last attempt failed only its candidate checks: keep what passes (ADR 0064).
    accepted = result.Checked.Output;
  }
  const applied = applyExtractionChecks(accepted, built.QuoteText, terms);
  return {
    Ok: true,
    Output: applied.Output,
    Dropped: applied.Dropped,
    QuotePositions: quotePositions(applied.Output, built.QuoteText),
    InputMode: built.InputMode,
    Model: config.Model,
    PromptVersion: EXTRACTION_PROMPT_VERSION,
    Attempts: result.Attempts,
  };
}

/**
 * Where the kept quotes start in the text that was sent, counted per tenth of its length
 * (ADR 0071, ADR 0065). Each quote is the exact span of that text (ADR 0064), so it is found
 * as it is. Only counts leave the step, never the text.
 */
export function quotePositions(output: ExtractionOutput, text: string): number[] {
  const tenths = Array.from({ length: 10 }, () => 0);
  if (text.length === 0) {
    return tenths;
  }
  for (const candidate of output.Candidates) {
    for (const quote of [
      candidate.EvidenceQuote,
      candidate.CustomerQuote,
      candidate.WhyNowQuote,
      candidate.AlternativeQuote,
    ]) {
      const at = quote ? text.indexOf(quote) : -1;
      if (at >= 0) {
        const tenth = Math.min(9, Math.floor((at * 10) / text.length));
        tenths[tenth] = (tenths[tenth] ?? 0) + 1;
      }
    }
  }
  return tenths;
}
