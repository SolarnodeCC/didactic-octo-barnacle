import { describe, expect, it } from "vitest";

import {
  RecordVerdictRequestSchema,
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
