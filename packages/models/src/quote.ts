/**
 * Quote normalisation (ADR 0064, REQ-AGENT-008 AC2). A quote counts as verbatim when it occurs in
 * the text the step received after both are normalised the same way, and the pipeline then stores
 * the exact span of the source text that matched. `scripts/check-golden-sets.py` mirrors these
 * rules in `normalize_for_quote`; `test-fixtures/quote-normalisation.json` keeps the two equal.
 */

/** Curly single quotes and primes become `'` (rule 2). */
const SINGLE_QUOTES = new Set(["‘", "’", "‚", "‛", "′", "‵"]);
/** Curly double quotes and double primes become `"` (rule 2). */
const DOUBLE_QUOTES = new Set(["“", "”", "„", "‟", "″", "‶"]);
/** Hyphen, non-breaking hyphen, figure dash, en dash, em dash, and minus sign become `-` (rule 3). */
const DASHES = new Set(["‐", "‑", "‒", "–", "—", "−"]);
/** Soft hyphen and zero-width characters are removed (rule 4). */
const REMOVED = new Set(["­", "​", "‌", "‍", "⁠", "﻿"]);
/**
 * Whitespace (rule 5), listed explicitly so the Python mirror uses the same set: ASCII whitespace,
 * next line, and the Unicode space separators, line separator, and paragraph separator.
 */
const WHITESPACE = new Set([
  "\t",
  "\n",
  "\u000B",
  "\f",
  "\r",
  " ",
  "\u0085",
  " ",
  " ",
  " ",
  " ",
  " ",
  " ",
  " ",
  " ",
  " ",
  " ",
  " ",
  " ",
  " ",
  " ",
  " ",
  " ",
  " ",
  "　",
]);

/** NFKC would turn the ellipsis into `...`; ADR 0064 keeps the two different, so it is kept. */
const KEPT = new Set(["\u2026"]);

const MARK = /^\p{M}$/u;

type Normalised = {
  Text: string;
  /** For each UTF-16 unit of `Text`, the start and end offsets of its source in the original. */
  Starts: number[];
  Ends: number[];
};

/**
 * Normalises one base character with its combining marks at a time, so each output unit maps back
 * to a span of the original. NFKC composes within such a cluster, which covers accented letters.
 */
function normaliseWithMap(text: string): Normalised {
  const units: string[] = [];
  const starts: number[] = [];
  const ends: number[] = [];
  const emit = (value: string, start: number, end: number) => {
    for (let i = 0; i < value.length; i += 1) {
      units.push(value[i] as string);
      starts.push(start);
      ends.push(end);
    }
  };

  const points = Array.from(text);
  let offset = 0;
  let index = 0;
  while (index < points.length) {
    const start = offset;
    let cluster = points[index] as string;
    offset += cluster.length;
    index += 1;
    while (index < points.length && MARK.test(points[index] as string)) {
      cluster += points[index] as string;
      offset += (points[index] as string).length;
      index += 1;
    }
    const normalised = KEPT.has(cluster) ? cluster : cluster.normalize("NFKC");
    for (const char of Array.from(normalised)) {
      if (REMOVED.has(char)) {
        continue;
      }
      if (WHITESPACE.has(char)) {
        if (units.length > 0 && units[units.length - 1] !== " ") {
          emit(" ", start, offset);
        }
        continue;
      }
      const mapped = SINGLE_QUOTES.has(char)
        ? "'"
        : DOUBLE_QUOTES.has(char)
          ? '"'
          : DASHES.has(char)
            ? "-"
            : char;
      emit(mapped, start, offset);
    }
  }
  while (units.length > 0 && units[units.length - 1] === " ") {
    units.pop();
    starts.pop();
    ends.pop();
  }
  return { Text: units.join(""), Starts: starts, Ends: ends };
}

/**
 * The five rules of ADR 0064: NFKC (except the ellipsis); curly quotes and primes to straight; the hyphen and dash
 * family to `-`; soft hyphens and zero-width characters removed; whitespace runs to one space,
 * ends trimmed. Letter case, ellipses, and words split by a line-break hyphen are not normalised.
 */
export function normalizeForQuote(text: string): string {
  return normaliseWithMap(text).Text;
}

/**
 * The exact span of `source` that matches `quote` after normalisation, or null when the quote
 * does not occur. The pipeline stores this span, not the model's version (ADR 0064).
 */
export function findQuoteSpan(source: string, quote: string): string | null {
  const needle = normalizeForQuote(quote);
  if (needle === "") {
    return null;
  }
  const haystack = normaliseWithMap(source);
  const at = haystack.Text.indexOf(needle);
  if (at === -1) {
    return null;
  }
  const start = haystack.Starts[at] as number;
  const end = haystack.Ends[at + needle.length - 1] as number;
  return source.slice(start, end);
}

/** Whether `quote` occurs in `text` after both are normalised (REQ-AGENT-008 AC2). */
export function quoteOccurs(text: string, quote: string): boolean {
  const needle = normalizeForQuote(quote);
  return needle !== "" && normalizeForQuote(text).includes(needle);
}
