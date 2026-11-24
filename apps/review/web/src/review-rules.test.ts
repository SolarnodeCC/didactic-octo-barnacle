import {
  CANDIDATE_TAGS,
  DEFAULT_ACCEPT_SCORE_CUT,
  REVIEW_STRATA,
  TRIAGE_TAGS,
  decideTriage,
  type TriageSignals,
} from "@roi/models";
import { describe, expect, it } from "vitest";

import { ACCEPT_SCORE_CUT, STRATUM_TEXT, TAG_OPTIONS, triageOutcome } from "./review-rules.js";

describe("REQ-REV-007: tags in the browser", () => {
  it("REQ-REV-007: offer exactly the tags the API accepts, with one distinct key each", () => {
    expect(TAG_OPTIONS.triage.map((o) => o.Tag)).toEqual([...TRIAGE_TAGS]);
    expect(TAG_OPTIONS.candidate.map((o) => o.Tag)).toEqual([...CANDIDATE_TAGS]);
    for (const options of Object.values(TAG_OPTIONS)) {
      const keys = options.map((o) => o.Key);
      expect(new Set(keys).size).toBe(keys.length);
      // Verdict keys and Enter/Escape stay free while the tag picker is open.
      expect(keys.some((k) => ["1", "2", "3"].includes(k))).toBe(false);
    }
  });

  it("REQ-REV-006: explains every stratum", () => {
    expect(Object.keys(STRATUM_TEXT).sort()).toEqual([...REVIEW_STRATA].sort());
  });
});

describe("REQ-REV-008: signal preview", () => {
  it("REQ-REV-008: decides exactly like the pipeline's triage rule for every signal combination", () => {
    expect(ACCEPT_SCORE_CUT).toBe(DEFAULT_ACCEPT_SCORE_CUT);
    const keys = [
      "NamedParty",
      "StatedHarm",
      "Trigger",
      "ExistingAlternative",
      "Adoptable",
    ] as const;
    for (let mask = 0; mask < 32; mask += 1) {
      const signals = Object.fromEntries(
        keys.map((key, i) => [key, Boolean(mask & (1 << i))]),
      ) as TriageSignals;
      const expected = decideTriage(signals);
      expect(triageOutcome(signals)).toEqual({
        Score: expected.TriageScore,
        Accepted: expected.Accepted,
      });
    }
  });
});
