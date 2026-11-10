---
title: "0076: Stream benchmark calls, and a larger output budget for reasoning models"
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-11-10
related: [REQ-AGENT-010, REQ-AGENT-014, REQ-NFR-003, REQ-NFR-005, REQ-NFR-011, REQ-TEST-006]
---

# 0076: Stream benchmark calls, and a larger output budget for reasoning models

- Decision status: Accepted (with round one, [ADR 0082](0082-benchmark-round-one-selects-no-model.md))
- Date: 2026-11-10
- Changes: the prompt versions `triage@1` and `extraction@1` (now `triage@2` and `extraction@2`), and the transport of the benchmark command in [running a round](../test/model-benchmark-run.md). No requirement changes.

## Context

The first live samples of round one ([benchmark plan](../test/model-benchmark-plan.md), [ADR 0062](0062-replace-deprecated-benchmark-candidates.md)) on 9 and 10 November 2026 returned no usable answer from three of the four candidate pairs. Two causes were found in the AI Gateway logs of `roi-staging` and the raw responses.

1. **Output budget.** `glm-4.7-flash` and `gemma-4-26b-a4b-it` are reasoning models. Workers AI returns their reasoning in a separate field and counts it as output tokens. With `triage@1` (`max_tokens` 1024), every call of both models ended with `finish_reason: length` while still reasoning, with an empty `content`, so all attempts failed validation. With `extraction@1` (4096), `deepseek-v4.1-flash-1017` used up to 4,212 tokens and `gemma-4-26b-a4b-it` 3,124 to 4,096. With a larger budget, triage used 977 to 2,502 tokens.
2. **Transport.** The command waits for the whole response. A reasoning model can take more than a minute before it answers. In the cloud agent session the HTTPS proxy closes a request without a response after 30 seconds (`502 upstream request failed`), while the gateway logged the same calls as successful. A streamed request starts within a second and was not cut off.

The benchmark plan fixes the same prompt and sampling for every candidate, and keeps the default reasoning setting in round one. Turning reasoning off would change the setting under test; a budget too small for the reasoning measures the budget, not the model.

## Options considered

1. **A larger `max_tokens` in new prompt versions, the same for every candidate, and streamed calls in the benchmark command.** Chosen.
2. **Turn reasoning off or limit it per model.** Rejected for round one: the plan tests one alternative reasoning setting only for finalists in round two.
3. **Run the benchmark outside the session proxy only.** Rejected as the only fix: the token budget fails anywhere, and a stream costs nothing extra.

## Decision

- `triage@2` and `extraction@2` have the text of version 1 and `max_tokens` 8192, at temperature 0. Sampling belongs to a prompt version ([phase 2 design](../phase-2/design.md)), so the version changes. 8192 is about twice the largest legitimate answer seen (4,212 tokens). A first try with 16,384 for extraction let `gemma-4-26b-a4b-it` produce degenerate reasoning until the limit, at about five minutes per attempt.
- The benchmark command streams every call (server-sent events on `/ai/run/<model>`, through the same gateway with the same headers) and rebuilds the response before `callModel` reads it, so validation, repair, and usage records do not change. `--no-stream` restores the old request. One call may take up to `--timeout-ms` (ten minutes by default).
- Behind an HTTPS proxy the command runs with `NODE_USE_ENV_PROXY=1`, because Node's `fetch` ignores `HTTPS_PROXY`.
- Pipeline Workers call Workers AI through the `AI` binding and are not affected by the proxy. Whether they stream is not decided here.

## Consequences

- Reasoning tokens are billed as output. A triage call costs about EUR 0.0004 to 0.0010 and an extraction call up to about EUR 0.005 at the price table of 2026-11-06, still far below the ceiling of 2 euro per opportunity (ADR 0023).
- The latency of a reasoning model includes its reasoning. The benchmark report shows p50 and p95 per model.
- `triage@1` and `extraction@1` were never used by the pipeline. Usage records of the first samples keep their version, so they are not mixed with round one.
