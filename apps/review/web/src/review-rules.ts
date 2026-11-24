import type { ReviewTag, ReviewTargetKind, TriageSignals } from "@roi/models";

/**
 * Review rules the browser needs while you type: the error tags with their keys (REQ-REV-007)
 * and the triage rule for the signal preview (REQ-REV-008). They repeat `@roi/models`, because the
 * browser bundle imports only types from it; review-rules.test.ts keeps them equal.
 */

export type TagOption = { Tag: ReviewTag; Key: string; Label: string };

export const TAG_OPTIONS: Record<ReviewTargetKind, TagOption[]> = {
  triage: [
    { Tag: "should-accept", Key: "a", Label: "Should accept" },
    { Tag: "should-reject", Key: "r", Label: "Should reject" },
    { Tag: "wrong-signal", Key: "s", Label: "Wrong signal" },
  ],
  candidate: [
    { Tag: "quote-does-not-support", Key: "q", Label: "Quote doesn't support it" },
    { Tag: "customer-wrong", Key: "c", Label: "Customer wrong or generic" },
    { Tag: "not-a-real-problem", Key: "p", Label: "Not a real problem" },
    { Tag: "duplicate", Key: "d", Label: "Duplicate" },
    { Tag: "overstated", Key: "o", Label: "Overstated" },
    { Tag: "why-now-or-alternative-wrong", Key: "w", Label: "Why-now or alternative wrong" },
  ],
};

export function tagLabel(tag: ReviewTag): string {
  return [...TAG_OPTIONS.triage, ...TAG_OPTIONS.candidate].find((o) => o.Tag === tag)?.Label ?? tag;
}

/** `triage.accept_score_cut` (packages/models/src/triage.ts). */
export const ACCEPT_SCORE_CUT = 0.55;

export const SIGNAL_LABELS: [keyof TriageSignals, string][] = [
  ["NamedParty", "Named party"],
  ["StatedHarm", "Stated harm"],
  ["Trigger", "Trigger"],
  ["ExistingAlternative", "Existing alternative"],
  ["Adoptable", "Adoptable"],
];

/** The triage rule: named party and stated harm, and a share of true signals at the cut. */
export function triageOutcome(signals: TriageSignals): { Score: number; Accepted: boolean } {
  const values = SIGNAL_LABELS.map(([key]) => signals[key]);
  const score = values.filter(Boolean).length / values.length;
  return {
    Score: score,
    Accepted: signals.NamedParty && signals.StatedHarm && score >= ACCEPT_SCORE_CUT,
  };
}

export const STRATUM_TEXT: Record<string, string> = {
  "new-prompt": "New prompt version",
  borderline: "Borderline triage (one signal from the cut)",
  "accepted-empty": "Accepted, but no candidates",
  "low-confidence": "Low extraction confidence",
  "model-rejection": "Rejected by the model",
  random: "Random check",
};
