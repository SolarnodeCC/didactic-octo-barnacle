import { describe, expect, it } from "vitest";

import { DEFAULT_PROCESSING_CONFIG, loadProcessingConfig } from "./processing-config.js";

describe("REQ-NFR-005: processing configuration", () => {
  it("REQ-NFR-005: processing is off unless an environment turns it on", () => {
    expect(loadProcessingConfig({}).Enabled).toBe(false);
    expect(loadProcessingConfig({ PROCESSING_ENABLED: "" }).Enabled).toBe(false);
    expect(loadProcessingConfig({ PROCESSING_ENABLED: "false" }).Enabled).toBe(false);
    expect(loadProcessingConfig({ PROCESSING_ENABLED: "true" }).Enabled).toBe(true);
  });

  it("REQ-NFR-005: an unrecognized flag value throws instead of turning processing on", () => {
    expect(() => loadProcessingConfig({ PROCESSING_ENABLED: "yes" })).toThrow(/PROCESSING_ENABLED/);
    expect(() => loadProcessingConfig({ PROCESSING_ENABLED: "1" })).toThrow(/PROCESSING_ENABLED/);
  });

  it("REQ-NFR-005: the other keys hold the values of docs/kt/architecture/defaults.md", () => {
    expect(loadProcessingConfig({ PROCESSING_ENABLED: "true" })).toEqual({
      ...DEFAULT_PROCESSING_CONFIG,
      Enabled: true,
    });
    expect(DEFAULT_PROCESSING_CONFIG).toEqual({
      Enabled: false,
      AdmissionPoolDays: 7,
      FullTextMaxChars: 24_000,
      EmbeddingBatchSize: 50,
      RetractionLookbackDays: 30,
      PriceTableVersion: "2026-11-11",
      ModelMaxAttempts: 3,
      TriageModel: {
        Model: "@cf/google/gemma-4-26b-a4b-it",
        PromptVersion: "triage@2",
        OutputMode: "json-schema",
        Reasoning: { Thinking: false },
      },
      ExtractionModel: {
        Model: "@cf/deepseek-ai/deepseek-v4.1-flash-1017",
        PromptVersion: "extraction@4",
        OutputMode: "json-schema",
      },
    });
  });

  it("REQ-AGENT-014: model.triage pins the model of benchmark round two with thinking off", () => {
    const { TriageModel } = DEFAULT_PROCESSING_CONFIG;
    expect(TriageModel.Model).toMatch(/^@cf\/[a-z0-9-]+\/[a-z0-9.-]+$/);
    expect(TriageModel.Reasoning).toEqual({ Thinking: false });
  });

  it("REQ-AGENT-014: model.extraction pins the model of benchmark round three at its default reasoning", () => {
    const { ExtractionModel } = DEFAULT_PROCESSING_CONFIG;
    expect(ExtractionModel.Model).toMatch(/^@cf\/[a-z0-9-]+\/[a-z0-9.-]+$/);
    expect(ExtractionModel.PromptVersion).toBe("extraction@4");
    expect(ExtractionModel.Reasoning).toBeUndefined();
  });
});
