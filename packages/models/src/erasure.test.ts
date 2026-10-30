import { describe, expect, it } from "vitest";

import { ErasureReasonSchema, ErasureRecordSchema } from "./erasure.js";

describe("REQ-NFR-016: erasure contracts hold no personal data", () => {
  it("REQ-NFR-016: the reason is one of three codes, never free text", () => {
    expect(ErasureReasonSchema.options).toEqual([
      "author-request",
      "legal-order",
      "ingested-in-error",
    ]);
    expect(() => ErasureReasonSchema.parse("Ada Lovelace asked by email")).toThrow();
  });

  it("REQ-NFR-016: a list entry is a 64-character hash, a reason code, and times", () => {
    const entry = {
      ErasureId: "era_1",
      SubjectHash: "a".repeat(64),
      Reason: "author-request",
      ErasedAt: "2026-10-30T10:00:00.000Z",
    };
    expect(ErasureRecordSchema.parse(entry).Reason).toBe("author-request");
    expect(() =>
      ErasureRecordSchema.parse({ ...entry, SubjectHash: "orcid:0000-0001-2345-6789" }),
    ).toThrow();
  });
});
