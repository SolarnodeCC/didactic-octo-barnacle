import { describe, expect, it } from "vitest";

import {
  CANDIDATE_TAGS,
  CandidateCorrectionSchema,
  RecordVerdictRequestSchema,
  TRIAGE_TAGS,
  UndoVerdictRequestSchema,
  ReviewListQuerySchema,
  REVIEW_NOTE_MAX,
  agreementRate,
} from "./review.js";

describe("REQ-REV-003: verdict request", () => {
  it("REQ-REV-003: accepts a verdict and turns empty note and correction into null", () => {
    const parsed = RecordVerdictRequestSchema.parse({
      TargetKind: "candidate",
      TargetId: "c1",
      Verdict: "incorrect",
      Note: "",
      Corrected: "",
    });
    expect(parsed).toEqual({
      TargetKind: "candidate",
      TargetId: "c1",
      Verdict: "incorrect",
      Note: null,
      Corrected: null,
      Tags: [],
      CorrectedSignals: null,
      CorrectedCandidate: null,
    });
  });

  it("REQ-REV-003: refuses an unknown verdict, a long note, and extra fields", () => {
    const base = { TargetKind: "triage", TargetId: "t1", Verdict: "correct" };
    expect(RecordVerdictRequestSchema.safeParse({ ...base, Verdict: "maybe" }).success).toBe(false);
    expect(
      RecordVerdictRequestSchema.safeParse({ ...base, Note: "x".repeat(REVIEW_NOTE_MAX + 1) })
        .success,
    ).toBe(false);
    expect(RecordVerdictRequestSchema.safeParse({ ...base, Reviewer: "me" }).success).toBe(false);
  });
});

describe("REQ-REV-001: list query", () => {
  it("REQ-REV-001: defaults the page size to 50 and refuses larger pages", () => {
    expect(ReviewListQuerySchema.parse({}).Limit).toBe(50);
    expect(ReviewListQuerySchema.safeParse({ Limit: "51" }).success).toBe(false);
    expect(ReviewListQuerySchema.safeParse({ Day: "24-11-2026" }).success).toBe(false);
  });
});

describe("REQ-REV-004: agreement rate", () => {
  it("REQ-REV-004: is correct over correct plus incorrect, and null without either", () => {
    expect(agreementRate(3, 1)).toBe(0.75);
    expect(agreementRate(0, 0)).toBeNull();
  });
});

describe("REQ-REV-007: error tags in the verdict request", () => {
  const base = { TargetKind: "candidate", TargetId: "c1", Verdict: "incorrect" } as const;

  it("REQ-REV-007: accepts tags of the target's step and removes duplicates", () => {
    const parsed = RecordVerdictRequestSchema.parse({
      ...base,
      Tags: ["duplicate", "duplicate", "overstated"],
    });
    expect(parsed.Tags).toEqual(["duplicate", "overstated"]);
    expect(CANDIDATE_TAGS).toContain("duplicate");
    expect(TRIAGE_TAGS).toEqual(["should-accept", "should-reject", "wrong-signal"]);
  });

  it("REQ-REV-007: refuses a tag of the other step and any tag on a correct verdict", () => {
    expect(RecordVerdictRequestSchema.safeParse({ ...base, Tags: ["should-accept"] }).success).toBe(
      false,
    );
    expect(
      RecordVerdictRequestSchema.safeParse({ ...base, Verdict: "correct", Tags: ["duplicate"] })
        .success,
    ).toBe(false);
  });
});

describe("REQ-REV-008: corrections and undo requests", () => {
  const signals = {
    NamedParty: true,
    StatedHarm: true,
    Trigger: false,
    ExistingAlternative: false,
    Adoptable: true,
  };

  it("REQ-REV-008: allows signals only on triage and candidate fields only on a candidate", () => {
    expect(
      RecordVerdictRequestSchema.safeParse({
        TargetKind: "triage",
        TargetId: "t1",
        Verdict: "incorrect",
        CorrectedSignals: signals,
      }).success,
    ).toBe(true);
    expect(
      RecordVerdictRequestSchema.safeParse({
        TargetKind: "candidate",
        TargetId: "c1",
        Verdict: "incorrect",
        CorrectedSignals: signals,
      }).success,
    ).toBe(false);
    expect(
      RecordVerdictRequestSchema.safeParse({
        TargetKind: "triage",
        TargetId: "t1",
        Verdict: "incorrect",
        CorrectedCandidate: { Customer: "Hospitals" },
      }).success,
    ).toBe(false);
  });

  it("REQ-REV-008: refuses an empty candidate correction and an unknown field", () => {
    expect(CandidateCorrectionSchema.safeParse({}).success).toBe(false);
    expect(CandidateCorrectionSchema.safeParse({ Customer: "Hospitals", Model: "x" }).success).toBe(
      false,
    );
    expect(CandidateCorrectionSchema.parse({ Customer: "Hospitals" })).toEqual({
      Customer: "Hospitals",
    });
  });

  it("REQ-REV-008: an undo names only the target", () => {
    expect(
      UndoVerdictRequestSchema.safeParse({ TargetKind: "triage", TargetId: "t1" }).success,
    ).toBe(true);
    expect(
      UndoVerdictRequestSchema.safeParse({
        TargetKind: "triage",
        TargetId: "t1",
        Verdict: "correct",
      }).success,
    ).toBe(false);
  });
});
