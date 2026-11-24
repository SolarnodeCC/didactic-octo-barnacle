/**
 * Hard checks against instructions planted in publication text (REQ-NFR-006 AC3, ADR 0122).
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

const TAG_NAME = "publication";
const WHITESPACE = /\s/u;
const WORD = /[A-Za-z0-9_]/u;

function skipWhitespace(text: string, from: number): number {
  let index = from;
  while (index < text.length && WHITESPACE.test(text.charAt(index))) {
    index += 1;
  }
  return index;
}

/**
 * True when a defused (`‹`) or live (`<`) publication tag starts at `index`: optional
 * whitespace, an optional `/`, optional whitespace, then `publication` in any letter case as
 * a whole word. A plain scan, no regular expression: quotes come from untrusted text, and a
 * pattern with two adjacent whitespace runs backtracks quadratically on `<` and many spaces.
 */
function delimiterAt(text: string, index: number): boolean {
  let at = skipWhitespace(text, index + 1);
  if (text.charAt(at) === "/") {
    at = skipWhitespace(text, at + 1);
  }
  const end = at + TAG_NAME.length;
  return text.slice(at, end).toLowerCase() === TAG_NAME && !WORD.test(text.charAt(end));
}

function containsDelimiter(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    const char = text.charAt(index);
    if ((char === "<" || char === "‹") && delimiterAt(text, index)) {
      return true;
    }
  }
  return false;
}

/** True when the text carries an instruction aimed at this pipeline (ADR 0122). */
export function containsPlantedInstruction(text: string): boolean {
  return containsDelimiter(text) || FIELD_NAME.test(text);
}
