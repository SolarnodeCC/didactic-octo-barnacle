---
title: "0089: Extraction reads the title and abstract without LaTeX markup"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-11
related: [REQ-AGENT-008, REQ-PROC-009, REQ-TEST-006]
---

# 0089: Extraction reads the title and abstract without LaTeX markup

- Decision status: Accepted
- Date: 2026-11-11
- Changes: the input of the extraction step ([contract conventions](../agents/contract-conventions.md), [opportunity extraction](../agents/opportunity-extraction.md)), the quote text of the extraction eval and of `scripts/check-golden-sets.py`, and one quote of `gs-extraction-039`. No requirement changes.

## Context

arXiv abstracts carry LaTeX markup: `\texttt{Pytest}`, `\textit{regular}`, `74\%`, `$p < 0.001$`. It occurs in 9 of the 91 fixtures and in 6 of the 39 extraction entries. In round two ([results](../test/benchmark-round-two-results.md)) it caused two of DeepSeek's three quotes that were not verbatim (it wrote `74%` for `74\%` and dropped `\textit{}`), and its one schema failure: on `gs-extraction-039` the output broke down into escape codes right after `\texttt{` on all three attempts. These are failures of the input, not of reading the publication.

## Options considered

1. **Clean the step's input.** Remove the markup from the title and abstract the step receives; the prompt and the quote check use the same cleaned text. Chosen by the owner.
2. **Normalise in the quote check only.** Fixes the quotes but not the breakdown, because the model still reads the markup.
3. **Leave it.** Counts input markup as model failures.

## Decision

- `cleanLatexMarkup` in `packages/models` removes the markup seen in abstracts: a formatting command (`\textit`, `\textbf`, `\texttt`, `\emph`, `\math…`, `\url`, and the like) keeps its argument; inline math keeps its content when it holds no prose word, so prices such as `$2.3M and $4M` stay; `\times`, `\approx`, `\sim`, `\leq`, `\geq`, `\neq`, `\pm`, `\cdot`, and `\dots` become characters; braces of a superscript or subscript go; an escaped `%`, `&`, `$`, `#`, `_`, `{`, or `}` loses its backslash. Anything else is left as it is.
- `buildExtractionPrompt` cleans the title and the abstract. Its `QuoteText`, the text the quote check uses, is the cleaned text, so a quote is verbatim in what the model read (REQ-AGENT-008). Full text from a PDF is not cleaned.
- The extraction eval checks quotes against the cleaned fixture text, and `scripts/check-golden-sets.py` applies the same rules to extraction labels. Both give the same result on the cases of `latex.test.ts`, and on the text of all 91 fixtures (checked when this ADR was written).
- The quote of `gs-extraction-039` drops `\texttt{}` around `unittest`: the same span of the text, without markup. The label's meaning does not change.
- Triage keeps reading the raw abstract: it quotes nothing, and its model was chosen on that input ([ADR 0088](0088-benchmark-round-two-selects-the-triage-model.md)).

## Consequences

- The rules exist twice, in TypeScript and Python. A change to one changes the other in the same pull request.
- A quote stored from an abstract may differ from the source by the removed markup. The stored quote is still the exact span of the text the step read.
- New markup in later abstracts stays in the text until a rule is added; the quote check still holds, because the model reads the same text.
