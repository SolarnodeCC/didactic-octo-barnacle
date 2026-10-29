---
title: Knowledge transfer index
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-28
---

# Knowledge transfer (KT) documents

The documents in `docs/kt/` are the source of truth for the Research Opportunity Intelligence Platform. They describe what the platform must do, how it is built, how it is tested, and why decisions were made. The root `README.md` is a summary that links here. Reviewers and agents check pull requests against these documents, especially the [requirements](requirements/README.md).

## Reading order

1. [Overview](overview.md): problem, users, vision, principles, success measures, non-goals, target industries, and core workflow.
2. [Glossary](glossary.md): terms used across the documents.
3. [Architecture](architecture/README.md): layers, orchestration, data model, security, privacy, technology stack, and repository layout.
4. [Data sources](data-sources/README.md): OpenAlex, arXiv, Semantic Scholar, and the ingestion scope.
5. [Agents](agents/README.md): the multi-agent framework, contract conventions, and each agent's typed output contract.
6. [Scoring](scoring.md): the opportunity scoring model.
7. [Roadmap](roadmap.md): MVP phases, requirements per phase, Definition of Ready, and exit criteria.
8. [Requirements](requirements/README.md): numbered, testable requirements.
9. [UX specification](ux/README.md): screen inventory, journeys, screen states, and wireframes.
10. [Test strategy](test/README.md): how requirements are verified.
11. [Operations](operations.md): checks, CI, environments, deployment, monitoring, and secrets handling.
12. [Decisions](decisions/README.md): architecture decision records (ADRs).
13. [Open questions](open-questions.md): decisions still to be made, with a proposal and a deadline phase.
14. [Examples](examples/README.md): example outputs as YAML files.

## Rules for KT documents

- **One topic per file.** A file may have at most 400 lines and 25 KiB. `scripts/check-kt.py` warns above 250 lines and fails above the limit. Split a growing document into a directory with its own `README.md` index.
- **Every directory has a `README.md` index** that links every file and subdirectory in it. The index holds links and one-line summaries, not content.
- **Every file starts with frontmatter** (see the template below). `status` is `draft`, `approved`, or `deprecated`. Review a document at least every 90 days and update `last_reviewed`; the check warns when a document is older. Accepted ADRs are exempt, because they are never edited.
- **Refer, do not copy.** Link to a requirement ID or a glossary term instead of repeating its text. Put long examples and schemas in `examples/` as YAML or JSON files.
- **A change is not done until the KT documents match it.** A pull request that changes behavior updates the affected document or requirement in the same pull request.
- **Record decisions as ADRs** in `decisions/`, one decision per file. Refer to a proposed ADR as a proposal, not as a decision.
- **Track open decisions** in [open questions](open-questions.md) instead of writing "not decided yet" in a document.
- **No secrets.** Name the GitHub Actions secret or Cursor environment secret instead of writing a value. Keep tokens and machine-local paths out.
- Write in English. Use a fenced code block with a language tag for commands, JSON, YAML, and diagrams.

## Ownership

Every document has an owner in its frontmatter. For the MVP one owner, `@SolarnodeCC`, holds every role below, and `.github/CODEOWNERS` requires its review for `docs/kt/`. Splitting the roles between people is OQ-034.

| Area | Owner role |
|---|---|
| Overview, roadmap, scoring, requirements | Product owner |
| Architecture, decisions, data sources, operations | Lead engineer |
| Agents, evals, test strategy | AI engineering lead |
| Security, privacy, accounts | Security and privacy lead |
| UX specification | Design lead |

## Document template

```markdown
---
title: Short title
owner: "@SolarnodeCC"
status: draft
last_reviewed: 2026-10-28
related: [REQ-DATA-001]
---

# Short title

Purpose of the document in one or two sentences.
```

`related` is optional. Every ID in it must exist in `requirements/`.

## Checks

```bash
python3 -m pip install -r scripts/requirements.txt
python3 scripts/check-kt.py
```

CI runs the same script on every pull request.
