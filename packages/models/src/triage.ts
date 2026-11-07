import { z } from "zod";

/**
 * Triage contract (docs/kt/agents/triage.md, REQ-PROC-006, REQ-PROC-008, ADR 0036). The
 * model reads five signals; plain code computes the score and the decision.
 */

export const TriageSignalsSchema = z
  .object({
    NamedParty: z.boolean(),
    StatedHarm: z.boolean(),
    Trigger: z.boolean(),
    ExistingAlternative: z.boolean(),
    Adoptable: z.boolean(),
  })
  .strict();
export type TriageSignals = z.infer<typeof TriageSignalsSchema>;

/**
 * What the model returns. Strict: the model never returns `TriageScore`, `Accepted`, or any
 * other field, because code decides (REQ-PROC-008 AC1).
 */
export const TriageModelOutputSchema = z
  .object({
    Signals: TriageSignalsSchema,
    Notes: z.string().max(200).nullable(),
  })
  .strict();
export type TriageModelOutput = z.infer<typeof TriageModelOutputSchema>;

export const TriageReasonSchema = z.enum([
  "accepted",
  "incomplete",
  "retracted",
  "out-of-scope",
  "low-score",
  "daily-limit",
]);
export type TriageReason = z.infer<typeof TriageReasonSchema>;

/** `triage.accept_score_cut`: three of five signals. */
export const DEFAULT_ACCEPT_SCORE_CUT = 0.55;

export type TriageDecision = {
  TriageScore: number;
  Accepted: boolean;
  Reason: Extract<TriageReason, "accepted" | "low-score">;
};

/**
 * The signal rule: accept when `NamedParty` and `StatedHarm` are both true and the share of
 * true signals is at or above the cut. The daily limit is applied afterwards by
 * `admitWithinDailyLimit`, across all accepted publications of the day.
 */
export function decideTriage(
  signals: TriageSignals,
  cut: number = DEFAULT_ACCEPT_SCORE_CUT,
): TriageDecision {
  const values = Object.values(TriageSignalsSchema.parse(signals));
  const score = values.filter(Boolean).length / values.length;
  const accepted = signals.NamedParty && signals.StatedHarm && score >= cut;
  return { TriageScore: score, Accepted: accepted, Reason: accepted ? "accepted" : "low-score" };
}

export type RankedTriage = { PublicationId: string; PublishedAt: string; TriageScore: number };

/**
 * Accepted publications ranked by score, then newest publication date, then publication ID;
 * those past the daily limit get `daily-limit` and are considered again the next day.
 */
export function admitWithinDailyLimit<T extends RankedTriage>(
  accepted: readonly T[],
  dailyLimit: number,
): { Admitted: T[]; Deferred: T[] } {
  const ranked = [...accepted].sort(
    (a, b) =>
      b.TriageScore - a.TriageScore ||
      b.PublishedAt.localeCompare(a.PublishedAt) ||
      a.PublicationId.localeCompare(b.PublicationId),
  );
  const limit = Math.max(0, Math.floor(dailyLimit));
  return { Admitted: ranked.slice(0, limit), Deferred: ranked.slice(limit) };
}
