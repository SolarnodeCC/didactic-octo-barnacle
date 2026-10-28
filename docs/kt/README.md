---
title: Knowledge transfer index
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-28
---

# Knowledge transfer (KT) documents

The documents in `docs/kt/` are the source of truth for the Research Opportunity Intelligence Platform. They describe what the platform must do, how it is built, how it is tested, and why decisions were made. The root `README.md` is a summary that links here. Reviewers and agents check pull requests against these documents, especially the [requirements](requirements/README.md).

## Reading order

1. [Overview](overview.md): problem, vision, target industries, and core workflow.
2. [Glossary](glossary.md): terms used across the documents.
3. [Architecture](architecture/README.md): layers, technology stack, and repository layout.
4. [Data sources](data-sources/README.md): OpenAlex, arXiv, and Semantic Scholar.
5. [Agents](agents/README.md): the multi-agent framework and each agent's output contract.
6. [Scoring](scoring.md): the opportunity scoring model.
7. [Roadmap](roadmap.md): MVP phases and deliverables.
8. [Requirements](requirements/README.md): numbered, testable requirements.
9. [Test strategy](test/README.md): how requirements are verified.
10. [Operations](operations.md): checks, CI, environments, and secrets handling.
11. [Decisions](decisions/README.md): architecture decision records (ADRs).
12. [Examples](examples/README.md): example outputs as YAML files.

## Rules for KT documents

- **One topic per file.** A file may have at most 400 lines and 25 KiB. `scripts/check-kt.py` warns above 250 lines and fails above the limit. Split a growing document into a directory with its own `README.md` index.
- **Every directory has a `README.md` index** that links every file and subdirectory in it. The index holds links and one-line summaries, not content.
- **Every file starts with frontmatter** (see the template below). `status` is `draft`, `approved`, or `deprecated`. Review a document at least every 90 days and update `last_reviewed`; the check warns when a document is older.
- **Refer, do not copy.** Link to a requirement ID or a glossary term instead of repeating its text. Put long examples and schemas in `examples/` as YAML or JSON files.
- **A change is not done until the KT documents match it.** A pull request that changes behavior updates the affected document or requirement in the same pull request.
- **Record decisions as ADRs** in `decisions/`, one decision per file.
- **No secrets.** Name the GitHub Actions secret or Cursor environment secret instead of writing a value. Keep tokens and machine-local paths out.
- Write in English. Use a fenced code block with a language tag for commands, JSON, YAML, and diagrams.

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
