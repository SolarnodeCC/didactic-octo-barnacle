/**
 * Removes the LaTeX markup that arXiv abstracts carry, so a model reads and quotes plain text
 * (ADR 0089). The extraction step sends the cleaned text and checks its quotes against the same
 * cleaned text, so quotes stay verifiable (REQ-AGENT-008). Only the markup seen in abstracts is
 * handled; anything else is left as it is.
 */

/** Formatting commands whose argument is kept: `\textit{regular}` becomes `regular`. */
const FORMATTING =
  /\\(?:text(?:it|bf|tt|sc|rm|sf|up|sl)?|emph|math(?:rm|bf|it|tt|sf)|underline|url)\{([^{}]*)\}/g;

/** Inline math whose content is kept: `$p < 0.001$` becomes `p < 0.001`. */
const INLINE_MATH = /(?<!\\)\$([^$\n]{1,80})(?<!\\)\$/g;

/** A word of three or more letters not preceded by a backslash: prose, not math. */
const PROSE_WORD = /(?<![\\A-Za-z])[A-Za-z]{3,}(?![A-Za-z])/;

const SYMBOLS: Readonly<Record<string, string>> = {
  times: "×",
  approx: "≈",
  sim: "~",
  leq: "≤",
  le: "≤",
  geq: "≥",
  ge: "≥",
  neq: "≠",
  pm: "±",
  cdot: "·",
  ldots: "...",
  dots: "...",
};

export function cleanLatexMarkup(text: string): string {
  let out = text;
  for (let previous = ""; previous !== out;) {
    previous = out;
    out = out.replace(FORMATTING, "$1");
  }
  // Two prices such as "$2 and $3" are prose, not math: math holds no prose word.
  out = out.replace(INLINE_MATH, (whole: string, inner: string) =>
    PROSE_WORD.test(inner) ? whole : inner,
  );
  out = out.replace(/\\([A-Za-z]+)(?![A-Za-z])/g, (whole: string, name: string) => {
    const symbol = SYMBOLS[name];
    return symbol === undefined ? whole : symbol;
  });
  out = out.replace(/([\^_])\{([^{}]*)\}/g, "$1$2");
  return out.replace(/\\([%&$#_{}])/g, "$1");
}
