import {
  type CallOutputMode,
  type InputMode,
  type ModelConfig,
  type ModelPrompt,
} from "@roi/models";

/** Sampling settings that belong to a prompt version, the same for every model (benchmark plan). */
export type Sampling = {
  Temperature: number;
  MaxTokens: number;
};

/** A built prompt: the messages and the exact text the model received, for the quote check. */
export type BuiltPrompt = {
  Prompt: ModelPrompt;
  /** The publication text as sent, inside the delimiters; quotes must occur in it. */
  QuoteText: string;
  InputMode: InputMode;
};

/** The model configuration of a step, from a pinned model ID and a prompt version. */
export function modelConfig(
  model: string,
  version: string,
  sampling: Sampling,
  outputMode: CallOutputMode = "json-schema",
): ModelConfig {
  return {
    Model: model,
    PromptVersion: version,
    OutputMode: outputMode,
    Temperature: sampling.Temperature,
    MaxTokens: sampling.MaxTokens,
  };
}
