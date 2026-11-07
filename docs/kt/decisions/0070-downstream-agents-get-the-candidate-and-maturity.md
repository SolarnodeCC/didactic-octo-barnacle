---
title: "0070: Downstream agents get the candidate and maturity"
owner: "@SolarnodeCC"
status: draft
last_reviewed: 2026-11-07
related: [REQ-AGENT-002, REQ-AGENT-003, REQ-AGENT-004, REQ-AGENT-005, REQ-AGENT-006, REQ-AGENT-007, REQ-PROC-009]
---

# 0070: Downstream agents get the candidate and maturity

- Decision status: Proposed
- Date: 2026-11-07
- Answers: none
- Changes: the inputs and rules of [Problem Discovery](../agents/problem-discovery.md), [Market Analysis](../agents/market-analysis.md), [Competition](../agents/competition.md), [Relevance](../agents/relevance.md), [Startup Generator](../agents/startup-generator.md), and one rule of [opportunity extraction](../agents/opportunity-extraction.md)

## Context

Extraction quotes up to four facts for each candidate: the problem (`Finding`, `EvidenceQuote`), the customer (`Customer`, `CustomerQuote`), and, when the text names them, the trigger (`WhyNow`, `WhyNowQuote`) and what the customer does today (`CurrentAlternative`, `AlternativeQuote`). These are the only verified facts about the candidate, because every quote is checked against the publication (REQ-PROC-009).

The 2026-11-07 review of the agent chain found that most of them stop at Problem Discovery. Problem Discovery receives the candidate, but its own output has no field for the trigger or the current alternative. Market Analysis, Competition, Relevance, and the Startup Generator receive only the Problem Discovery and Research Analyst outputs, so:

- Competition never sees the current alternative the publication names, although that alternative is the first competitor to check.
- The Startup Generator writes the `WhyNow` entry of the validation brief without the quoted trigger.
- Relevance estimates `TechnicalFeasibility` with no evidence, because it gets no publication text.
- Market Analysis and Competition do not get the Research Analyst's `Maturity`, which bounds how soon a product can exist.
- [Opportunity extraction](../agents/opportunity-extraction.md) says later agents "may supply" `WhyNow` and `CurrentAlternative` from search, but no contract has a field for it.

In a pipeline without a person, a fact that one agent quoted and the next one cannot see is a fact the next one guesses.

## Options considered

1. **Pass the stored candidate to every downstream agent, and `Maturity` to Market Analysis and Competition.** Chosen. The candidate is small (eight short fields) and already stored.
2. **Add trigger and alternative fields to the Problem Discovery output** and let it pass them on. Rejected: it copies verified quotes through a model step, where they can be rephrased and lose their check.
3. **Give triage signals to extraction as hints.** Rejected: triage reads only the abstract with a cheap model, and its signals would anchor a step that reads more text. The agreement between triage signals and extraction results is measured instead (ADR 0071, proposed with this decision).
4. **Let Market Analysis and Competition see each other's output.** Rejected: it serialises two steps that run in parallel today. The Startup Generator already reconciles them.

## Decision

- **Inputs.** Market Analysis, Competition, Relevance, and the Startup Generator also receive the stored candidate: `Finding`, `Customer`, and, when set, `WhyNow` and `CurrentAlternative`, each with its quote. Market Analysis and Competition also receive the Research Analyst's `Maturity`.
- **Problem Discovery.** Its `Customer` refines the extraction `Customer` (segment, role, industry) and never names a different party.
- **Competition.** When `CurrentAlternative` is set, it appears in `Competitors`, normally with `Kind: substitute`, or `Notes` says why it is not a competitor. `Verified` still needs a search result.
- **Relevance.** It may cite the candidate's quotes as `publication-quote` evidence for `TechnicalFeasibility`. Without such a quote, `TechnicalFeasibility` stays a model estimate as before.
- **Startup Generator.** When `WhyNow` is set, the `WhyNow` entry of the validation brief starts from it. When it is not set, the entry says that the publication names no trigger.
- **Opportunity extraction.** The rule that later agents "may supply" `WhyNow` and `CurrentAlternative` is replaced: later agents use them when extraction quoted them, and Competition may find further alternatives through search.

## Consequences

- No requirement text changes: REQ-AGENT-007 AC1 already points to the agent documents for inputs. Only the draft agent documents change.
- The quoted facts reach every agent that reasons about them, and they keep their quotes because no model step rewrites them.
- The analysis golden sets of REQ-TEST-005 gain the candidate in their inputs before the phase 3 evals run.
- Prompts grow by a few hundred characters per call, within the per-call cost of ADR 0023.
