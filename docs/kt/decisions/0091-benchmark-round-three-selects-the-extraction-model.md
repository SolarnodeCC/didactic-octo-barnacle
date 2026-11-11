---
title: "0091: Benchmark round three selects DeepSeek for extraction"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-11
related: [REQ-AGENT-014, REQ-PROC-009, REQ-NFR-011, REQ-TEST-006]
---

# 0091: Benchmark round three selects DeepSeek for extraction

- Decision status: Accepted
- Date: 2026-11-11
- Answers: OQ-036 for extraction (triage: [ADR 0088](0088-benchmark-round-two-selects-the-triage-model.md)); OQ-036 stays open for the six analysis agents
- Changes: `model.extraction` in [defaults](../architecture/defaults.md) and the [phase 2 schema](../phase-2/schema.md), the row of OQ-036 in [open questions](../open-questions.md), and the gate in the [phase 2 dependencies](../phase-2/dependencies.md)

## Context

Round three ran on 11 November 2026 as [ADR 0090](0090-extraction-prompt-four-and-benchmark-round-three.md) planned: `@cf/deepseek-ai/deepseek-v4.1-flash-1017` on `extraction@4`, with the text cleaned of LaTeX markup ([ADR 0089](0089-extraction-reads-text-without-latex-markup.md)), three runs per item, price table `2026-11-11`, gateway `roi-staging`, benchmark ID `bench-2026-11-11T15-41-20-872Z`. The [results](../test/benchmark-round-three-results.md) hold the report summary; the raw responses are not committed.

| Measure | Round two (`extraction@3`) | Round three (`extraction@4`) |
|---|---|---|
| Pass rate per run | 87.2 / 76.9 / 82.1 % | 87.2 / 87.2 / 89.7 % |
| Threshold met in all runs (0.80) | no | yes |
| Failures over three runs (count, quote, schema) | 18, 3, 1 | 13, 1, 0 |
| Stability | 84.6 % | 92.3 % |
| Cost per item | EUR 0.00177 | EUR 0.00210 |

## Decision

- **`model.extraction` is `@cf/deepseek-ai/deepseek-v4.1-flash-1017`** at its default reasoning (effort `high`), prompt `extraction@4`, `json-schema` output, temperature 0 and at most 8192 output tokens from the prompt's sampling settings. It meets the threshold in every run, with a mean of 88.0 %, and is the only candidate of round three, so decision rule 2 of the plan has nothing to compare. The Workers AI catalog (read 2026-11-11) lists it with no preview status and no planned deprecation, so decision rule 4 does not apply; it requires Workers Paid, which the account has.
- OQ-036 is answered for triage and extraction, the two steps that gate phase 2. It stays open for the six analysis agents, which are benchmarked before phase 3.

## Consequences

- The extraction step of WP6 uses this configuration (`ExtractionModel` in `apps/pipeline/src/processing-config.ts`).
- As ADR 0090 recorded, the prompt changes came from DeepSeek's failures on the same 39 entries, so these scores may flatter it. The daily judge sample of [ADR 0081](0081-workers-ai-judge-for-a-daily-sample-of-live-output.md) checks live output once phase 2 runs.
- Remaining failures, for the owner's next label review: DeepSeek still names a customer on `gs-extraction-015`, `020`, and `022`, labelled with none (8 of 12 answers, down from 11); it still reads the qualified "organization" of `003` as bare in two runs; and on `002` it returns a second candidate, "digital news outlets", next to the labelled "national-level regulatory bodies", in every run. The second candidate has its own customer and problem, which the rule of [ADR 0085](0085-one-primary-extraction-candidate.md) allows, so the label may be the one to change.
- Cost check ([ADR 0054](0054-processing-runs-and-model-call-records.md)): AI Gateway logged 122 calls and USD 0.2743 under the benchmark ID; the usage records give the same calls, tokens, and cost (EUR 0.2451). Round three used EUR 0.25 of its budget of EUR 5.
- Phase 2 no longer waits on OQ-036. Its other gates are in the [dependencies](../phase-2/dependencies.md).
