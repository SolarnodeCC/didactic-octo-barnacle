import { callModel, type ModelConfig } from "@roi/models";
import {
  PROBLEM_DISCOVERY_CONTRACT,
  PROBLEM_DISCOVERY_PROMPT_VERSION,
  PROBLEM_DISCOVERY_SAMPLING,
  RELEVANCE_CONTRACT,
  RELEVANCE_PROMPT_VERSION,
  RELEVANCE_SAMPLING,
  RESEARCH_ANALYST_CONTRACT,
  RESEARCH_ANALYST_PROMPT_VERSION,
  RESEARCH_ANALYST_SAMPLING,
  buildProblemDiscoveryPrompt,
  buildRelevancePrompt,
  buildResearchAnalystPrompt,
  modelConfig,
  type BuiltPrompt,
  type Sampling,
} from "@roi/prompts";
import { type z } from "zod";

import { type CallModelFnOptions } from "../model-fn.js";

import { type EntryModelFn } from "./eval.js";
import {
  type ProblemDiscoveryEntry,
  type RelevanceEntry,
  type ResearchAnalystEntry,
} from "./golden-set.js";

/**
 * `EntryModelFn`s that run the analysis prompts through `callModel` for the benchmark
 * (ADR 0093). Each builds its input from the golden-set entry: the extraction candidate and
 * the frozen outputs of the earlier agents, never another model's live output.
 */

function config(options: CallModelFnOptions, version: string, sampling: Sampling): ModelConfig {
  const base = modelConfig(options.Model, version, sampling, options.OutputMode);
  return options.Reasoning === undefined ? base : { ...base, Reasoning: options.Reasoning };
}

function stepFn<E extends { Publication: { Id: string } }>(
  options: CallModelFnOptions,
  step: string,
  version: string,
  sampling: Sampling,
  contract: z.ZodObject,
  build: (entry: E) => BuiltPrompt,
): EntryModelFn<E> {
  const modelConfigForStep = config(options, version, sampling);
  return async (entry) => {
    const result = await callModel(options.Deps, {
      RunKind: "processing",
      RunId: options.RunId,
      StepName: step,
      Agent: step,
      PublicationId: entry.Publication.Id,
      CandidateId: null,
      Config: modelConfigForStep,
      Prompt: build(entry).Prompt,
      Contract: contract,
    });
    options.OnResult?.(entry.Publication.Id, result);
    return result.Ok ? result.Output : null;
  };
}

export function researchAnalystModelFn(
  options: CallModelFnOptions,
): EntryModelFn<ResearchAnalystEntry> {
  return stepFn(
    options,
    "research-analyst",
    RESEARCH_ANALYST_PROMPT_VERSION,
    RESEARCH_ANALYST_SAMPLING,
    RESEARCH_ANALYST_CONTRACT,
    (entry: ResearchAnalystEntry) =>
      buildResearchAnalystPrompt({
        Title: entry.Publication.Title,
        Abstract: entry.Publication.Abstract,
        Finding: entry.Candidate.finding,
        Customer: entry.Candidate.customer,
        Related: entry.Neighbors.slice(0, 10),
      }),
  );
}

export function problemDiscoveryModelFn(
  options: CallModelFnOptions,
): EntryModelFn<ProblemDiscoveryEntry> {
  return stepFn(
    options,
    "problem-discovery",
    PROBLEM_DISCOVERY_PROMPT_VERSION,
    PROBLEM_DISCOVERY_SAMPLING,
    PROBLEM_DISCOVERY_CONTRACT,
    (entry: ProblemDiscoveryEntry) =>
      buildProblemDiscoveryPrompt({
        Title: entry.Publication.Title,
        Abstract: entry.Publication.Abstract,
        Candidate: {
          Finding: entry.Candidate.finding,
          EvidenceQuote: entry.Candidate.evidenceQuote,
          Customer: entry.Candidate.customer,
          CustomerQuote: entry.Candidate.customerQuote,
          WhyNow: entry.Candidate.whyNow ?? null,
          CurrentAlternative: entry.Candidate.currentAlternative ?? null,
        },
        ResearchAnalyst: {
          Novelty: entry.ResearchAnalyst.novelty,
          Maturity: entry.ResearchAnalyst.maturity,
          Industry: entry.ResearchAnalyst.industry,
          Technology: entry.ResearchAnalyst.technology,
        },
      }),
  );
}

export function relevanceModelFn(options: CallModelFnOptions): EntryModelFn<RelevanceEntry> {
  return stepFn(
    options,
    "relevance",
    RELEVANCE_PROMPT_VERSION,
    RELEVANCE_SAMPLING,
    RELEVANCE_CONTRACT,
    (entry: RelevanceEntry) => {
      const [low, high] = entry.ProblemDiscovery.painLevelRange;
      return buildRelevancePrompt({
        Candidate: {
          Finding: entry.Candidate.finding,
          Customer: entry.Candidate.customer,
          WhyNow: entry.Candidate.whyNow ?? null,
          WhyNowQuote: entry.Candidate.whyNowQuote ?? null,
          CurrentAlternative: entry.Candidate.currentAlternative ?? null,
          AlternativeQuote: entry.Candidate.alternativeQuote ?? null,
        },
        ResearchAnalyst: {
          Maturity: entry.ResearchAnalyst.maturity,
          Industry: entry.ResearchAnalyst.industry,
          Technology: entry.ResearchAnalyst.technology,
        },
        // The golden set holds the facts of the Problem Discovery output, not a full output.
        ProblemDiscovery: {
          Problem: entry.ProblemDiscovery.requiredFacts.join("; "),
          CustomerIndustry: entry.ProblemDiscovery.customerIndustry,
          PainLevel: low === high ? String(low) : `${low} to ${high}`,
        },
      });
    },
  );
}
