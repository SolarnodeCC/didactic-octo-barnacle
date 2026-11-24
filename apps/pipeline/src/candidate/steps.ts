import {
  EvidenceSchema,
  STEP_AGENTS,
  type AgentName,
  type AgentStepName,
  type Evidence,
  type ExtractionCandidate,
  type InputMode,
} from "@roi/models";

import { STUB_OUTPUTS } from "./stub-outputs.js";

/** What a step reads: the candidate, its publication, and the outputs of the steps before it. */
export type AgentStepInput = {
  PipelineRunId: string;
  CandidateId: string;
  PublicationId: string;
  InputMode: InputMode;
  Candidate: ExtractionCandidate;
  /** Outputs of the completed steps of this run, by step name. */
  Previous: Partial<Record<AgentStepName, unknown>>;
};

/** What a step returns: its output and evidence, and the model and prompt that produced them. */
export type AgentStepResult = {
  Model: string;
  PromptVersion: string;
  Attempts: number;
  Output: unknown;
  Evidence: Evidence[];
};

/**
 * One agent step of the candidate pipeline. Phase 3 replaces a stub with the real agent by
 * replacing its entry in the step registry; the pipeline does not change (REQ-PROC-007 AC4).
 */
export type AgentStep = {
  Name: AgentStepName;
  Agent: AgentName;
  run(input: AgentStepInput): Promise<AgentStepResult>;
};

export type CandidateSteps = Record<AgentStepName, AgentStep>;

/** The model and prompt version a stub output is stored with. */
export const STUB_MODEL = "stub";
export const STUB_PROMPT_VERSION = "example";

/**
 * A stub step: it returns its agent's section of the example as the output, with the example's
 * evidence (REQ-PROC-007 AC3). A quote of the publication names the run's publication.
 */
export function stubStep(name: AgentStepName): AgentStep {
  const agent = STEP_AGENTS[name];
  return {
    Name: name,
    Agent: agent,
    run(input) {
      const section = STUB_OUTPUTS[agent];
      if (section === undefined) {
        return Promise.reject(new Error(`the example has no ${agent} section`));
      }
      const { Evidence = [], ...output } = section;
      const evidence = Evidence.map((item) => {
        const parsed = EvidenceSchema.parse(item);
        return parsed.Kind === "publication-quote"
          ? { ...parsed, PublicationId: input.PublicationId }
          : parsed;
      });
      return Promise.resolve({
        Model: STUB_MODEL,
        PromptVersion: STUB_PROMPT_VERSION,
        Attempts: 1,
        Output: structuredClone(output),
        Evidence: evidence,
      });
    },
  };
}

/** The steps of phase 2: every agent is a stub (REQ-PROC-007). */
export const STUB_STEPS: CandidateSteps = {
  research_analyst: stubStep("research_analyst"),
  problem_discovery: stubStep("problem_discovery"),
  market_analysis: stubStep("market_analysis"),
  competition: stubStep("competition"),
  relevance: stubStep("relevance"),
  startup_generator: stubStep("startup_generator"),
};
