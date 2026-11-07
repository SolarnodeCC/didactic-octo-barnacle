import { describe, expect, it } from "vitest";

import {
  CandidateRowSchema,
  ExtractionResultRowSchema,
  ProcessingRunSchema,
  TriageDecisionRowSchema,
  type TriageDecisionRow,
} from "./processing.js";
import { QueueMessageIdsSchema } from "./queue-message.js";

const now = "2026-11-07T12:00:00Z";

const modelDecision: TriageDecisionRow = {
  Id: "td_1",
  PublicationId: "pub_1",
  RunId: "run_1",
  Status: "decided",
  Accepted: true,
  Score: 0.6,
  Reason: "accepted",
  Signals: {
    NamedParty: true,
    StatedHarm: true,
    Trigger: false,
    ExistingAlternative: false,
    Adoptable: true,
  },
  Notes: null,
  Model: "@cf/zai-org/glm-4.7-flash",
  PromptVersion: "triage@1",
  AdmittedOn: "2026-11-07",
  CreatedAt: now,
  UpdatedAt: now,
};

const ruleRejection: TriageDecisionRow = {
  ...modelDecision,
  Accepted: false,
  Score: null,
  Reason: "out-of-scope",
  Signals: null,
  Model: null,
  PromptVersion: null,
  AdmittedOn: null,
};

describe("REQ-PROC-006: triage decision rows", () => {
  it("REQ-PROC-006: AC2 a rule rejection has no signals, score, model, or prompt version", () => {
    expect(TriageDecisionRowSchema.parse(ruleRejection).Reason).toBe("out-of-scope");
    expect(
      TriageDecisionRowSchema.safeParse({ ...ruleRejection, Model: "@cf/zai-org/glm-4.7-flash" })
        .success,
    ).toBe(false);
  });

  it("REQ-PROC-006: a model decision keeps its signals, score, model, and prompt version", () => {
    expect(TriageDecisionRowSchema.parse(modelDecision).Signals?.NamedParty).toBe(true);
    expect(
      TriageDecisionRowSchema.safeParse({ ...modelDecision, PromptVersion: null }).success,
    ).toBe(false);
  });
});

describe("REQ-PROC-008: triage admission state", () => {
  const waiting: TriageDecisionRow = {
    ...modelDecision,
    Status: "awaiting-admission",
    Accepted: false,
    Reason: null,
    AdmittedOn: null,
  };

  it("REQ-PROC-008: AC3 a passing publication waits for admission without a reason yet", () => {
    expect(TriageDecisionRowSchema.parse(waiting).Status).toBe("awaiting-admission");
    expect(TriageDecisionRowSchema.parse({ ...waiting, Reason: "daily-limit" }).Reason).toBe(
      "daily-limit",
    );
    expect(TriageDecisionRowSchema.safeParse({ ...waiting, Status: "decided" }).success).toBe(
      false,
    );
  });

  it("REQ-PROC-008: AC4 an admitted decision is accepted with its admission day", () => {
    expect(TriageDecisionRowSchema.safeParse({ ...modelDecision, AdmittedOn: null }).success).toBe(
      false,
    );
    expect(
      TriageDecisionRowSchema.safeParse({ ...modelDecision, Reason: "low-score" }).success,
    ).toBe(false);
  });
});

describe("REQ-PROC-009: extraction result and candidate rows", () => {
  const result = {
    Id: "er_1",
    PublicationId: "pub_1",
    RunId: "run_1",
    Model: "@cf/deepseek-ai/deepseek-v4.1-flash-1017",
    PromptVersion: "extraction@1",
    InputMode: "abstract" as const,
    Confidence: 0.6,
    Notes: null,
    CandidateCount: 1,
    CreatedAt: now,
  };

  it("REQ-PROC-009: abstract-only input caps Confidence at 0.7", () => {
    expect(ExtractionResultRowSchema.parse(result).Confidence).toBe(0.6);
    expect(ExtractionResultRowSchema.safeParse({ ...result, Confidence: 0.8 }).success).toBe(false);
    expect(
      ExtractionResultRowSchema.parse({ ...result, InputMode: "full-text", Confidence: 0.8 })
        .Confidence,
    ).toBe(0.8);
  });

  it("REQ-PROC-004: a candidate row keeps the contract fields and its keys", () => {
    const candidate = {
      Id: "cand_1",
      PublicationId: "pub_1",
      ExtractionResultId: "er_1",
      Finding: "Grid operators lack early warning of transformer failures.",
      EvidenceQuote: "transformer failures cause outages",
      Customer: "Grid operators",
      CustomerQuote: "grid operators",
      WhyNow: null,
      WhyNowQuote: null,
      CurrentAlternative: null,
      AlternativeQuote: null,
      HiddenReason: null,
      CreatedAt: now,
    };
    expect(CandidateRowSchema.parse(candidate).Customer).toBe("Grid operators");
    expect(CandidateRowSchema.safeParse({ ...candidate, WhyNow: "New rules" }).success).toBe(false);
    expect(CandidateRowSchema.parse({ ...candidate, HiddenReason: "retracted" }).HiddenReason).toBe(
      "retracted",
    );
  });
});

describe("REQ-NFR-005: processing runs", () => {
  it("REQ-NFR-005: a processing run has a kind, a day, counts, and failures", () => {
    const run = {
      Id: "run_1",
      Kind: "daily",
      Day: "2026-11-07",
      Status: "succeeded",
      StartedAt: now,
      EndedAt: now,
      Counts: { Triaged: 120, Extracted: 10 },
      Failures: [{ PublicationId: "pub_9", Reason: "provider-error" }],
    };
    expect(ProcessingRunSchema.parse(run).Kind).toBe("daily");
    expect(ProcessingRunSchema.safeParse({ ...run, Kind: "weekly" }).success).toBe(false);
    expect(ProcessingRunSchema.safeParse({ ...run, Counts: { Triaged: -1 } }).success).toBe(false);
  });
});

describe("REQ-DATA-011: queue messages carry IDs only", () => {
  it("REQ-DATA-011: a message may carry a candidate ID", () => {
    expect(QueueMessageIdsSchema.parse({ CandidateId: "cand_1" }).CandidateId).toBe("cand_1");
  });
});
