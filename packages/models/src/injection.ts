/**
 * Hard checks against instructions planted in publication text (REQ-NFR-006 AC3, ADR 0119).
 *
 * The prompt tells the model that the delimited publication is data (soft control). These
 * checks are code: a candidate whose quote carries an instruction aimed at this pipeline is
 * dropped, whatever the model made of it. They look only for text that no genuine paper
 * contains, so a paper about prompt injection keeps its quotes:
 *
 * - a publication delimiter, which `defuseTags` turns into `‹publication>` or
 *   `‹/publication>` when the text tries to close or open the block;
 * - a field name of this pipeline's output contracts (`NamedParty`, `EvidenceQuote`, ...)
 *   in their exact spelling, which a paper has no reason to write.
 */

/** Field names of the triage and extraction contracts, matched case-sensitively as words. */
export const CONTRACT_FIELD_NAMES = [
  "NamedParty",
  "StatedHarm",
  "ExistingAlternative",
  "Adoptable",
  "TriageScore",
  "EvidenceQuote",
  "CustomerQuote",
  "WhyNowQuote",
  "AlternativeQuote",
  "CurrentAlternative",
] as const;

const FIELD_NAME = new RegExp(`\\b(?:${CONTRACT_FIELD_NAMES.join("|")})\\b`, "u");

/** A defused (`‹`) or live (`<`) publication tag, with optional spaces and slash. */
const DELIMITER = /[<‹]\s*\/?\s*publication\b/iu;

/** True when the text carries an instruction aimed at this pipeline (ADR 0119). */
export function containsPlantedInstruction(text: string): boolean {
  return DELIMITER.test(text) || FIELD_NAME.test(text);
}
