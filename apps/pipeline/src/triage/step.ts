import {
  callModel,
  type CallModelDeps,
  type CallModelResult,
  type ModelConfig,
  type TriageModelOutput,
} from "@roi/models";
import {
  TRIAGE_CONTRACT,
  TRIAGE_PROMPT_VERSION,
  TRIAGE_SAMPLING,
  buildTriagePrompt,
  modelConfig,
} from "@roi/prompts";

export type TriageStepInput = {
  RunId: string;
  /** Null only for the breaker's probe call, which reads no stored publication. */
  PublicationId: string | null;
  Title: string;
  Abstract: string;
};

/**
 * The model part of triage (REQ-PROC-008 AC1): the versioned prompt `triage@2` reads the five
 * signals from the title and abstract, inside the delimiters that mark them as data, and
 * `callModel` validates the strict contract, retries, and records usage. It lives in the
 * pipeline rather than `agents/extraction` so the Worker bundle stays free of the benchmark
 * command's dependencies.
 */
export async function runTriageStep(
  deps: CallModelDeps,
  model: ModelConfig,
  input: TriageStepInput,
): Promise<CallModelResult<TriageModelOutput>> {
  if (model.PromptVersion !== TRIAGE_PROMPT_VERSION) {
    throw new Error(
      `model.triage names prompt ${String(model.PromptVersion)}, but the pipeline has ${TRIAGE_PROMPT_VERSION}`,
    );
  }
  const config: ModelConfig = {
    ...modelConfig(model.Model, TRIAGE_PROMPT_VERSION, TRIAGE_SAMPLING, model.OutputMode),
    ...(model.Reasoning ? { Reasoning: model.Reasoning } : {}),
  };
  const built = buildTriagePrompt({ Title: input.Title, Abstract: input.Abstract });
  return callModel(deps, {
    RunKind: "processing",
    RunId: input.RunId,
    StepName: "triage",
    Agent: null,
    PublicationId: input.PublicationId,
    CandidateId: null,
    Config: config,
    Prompt: built.Prompt,
    Contract: TRIAGE_CONTRACT,
  });
}
