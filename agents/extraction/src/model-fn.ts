import {
  callModel,
  extractionMissingQuotes,
  type CallModelDeps,
  type CallOutputMode,
} from "@roi/models";
import {
  EXTRACTION_PROMPT_VERSION,
  EXTRACTION_SAMPLING,
  TRIAGE_CONTRACT,
  TRIAGE_PROMPT_VERSION,
  TRIAGE_SAMPLING,
  buildExtractionPrompt,
  buildTriagePrompt,
  extractionContract,
  modelConfig,
} from "@roi/prompts";

import { type ModelFn } from "./eval.js";

/**
 * `ModelFn`s that run the versioned prompts through `callModel`, so the eval runner scores a
 * real model for the benchmark (docs/kt/test/model-benchmark-plan.md, OQ-036). Retries,
 * repairs, and usage records happen inside `callModel`; the runner then scores the accepted
 * output. A step that fails all attempts yields null, which the runner counts as a failure.
 */
export type CallModelFnOptions = {
  Deps: CallModelDeps;
  /** Exact, pinned model ID (REQ-AGENT-014). */
  Model: string;
  /** The `processing_run` of the benchmark, for the usage records. */
  RunId: string;
  OutputMode?: CallOutputMode;
};

export function triageModelFn(options: CallModelFnOptions): ModelFn {
  const config = modelConfig(
    options.Model,
    TRIAGE_PROMPT_VERSION,
    TRIAGE_SAMPLING,
    options.OutputMode,
  );
  return async (publication) => {
    const built = buildTriagePrompt({ Title: publication.Title, Abstract: publication.Abstract });
    const result = await callModel(options.Deps, {
      RunKind: "processing",
      RunId: options.RunId,
      StepName: "triage",
      Agent: null,
      PublicationId: publication.Id,
      CandidateId: null,
      Config: config,
      Prompt: built.Prompt,
      Contract: TRIAGE_CONTRACT,
    });
    return result.Ok ? result.Output : null;
  };
}

export function extractionModelFn(
  options: CallModelFnOptions & { MaxCandidates?: number },
): ModelFn {
  const config = modelConfig(
    options.Model,
    EXTRACTION_PROMPT_VERSION,
    EXTRACTION_SAMPLING,
    options.OutputMode,
  );
  const contract = extractionContract(options.MaxCandidates);
  return async (publication) => {
    const built = buildExtractionPrompt({
      Title: publication.Title,
      Abstract: publication.Abstract,
      FullText: null,
      ...(options.MaxCandidates === undefined ? {} : { MaxCandidates: options.MaxCandidates }),
    });
    const result = await callModel(options.Deps, {
      RunKind: "processing",
      RunId: options.RunId,
      StepName: "extraction",
      Agent: null,
      PublicationId: publication.Id,
      CandidateId: null,
      Config: config,
      Prompt: built.Prompt,
      Contract: contract,
      MissingQuotes: (output) => extractionMissingQuotes(output, built.QuoteText),
    });
    return result.Ok ? result.Output : null;
  };
}
