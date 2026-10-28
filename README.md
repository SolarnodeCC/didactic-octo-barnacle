# Research Opportunity Intelligence Platform

Innovation teams, consultants and venture builders spend hundreds of hours manually reviewing research papers to identify commercially viable opportunities. Most promising discoveries never reach the market because there is no scalable process for translating scientific findings into validated software concepts. Goal is to transform scientific research into validated software opportunities, startup concepts, and enterprise innovation initiatives.

> This README is a summary. The knowledge transfer (KT) documents in [`docs/kt/`](docs/kt/README.md) are the source of truth for requirements, architecture, and the test strategy.

## Overview

The platform automatically analyzes scientific publications from OpenAlex, arXiv, and Semantic Scholar, and identifies opportunities for SaaS products, AI solutions, digital services, enterprise software, and government, healthcare, and financial services innovation.

```text
Scientific Research → Problem Discovery → Market Analysis → Competitive Analysis
→ Software Opportunity Discovery → Startup Generation → Business Case Creation
→ Opportunity Scoring
```

## Documentation

| Topic | KT document |
|---|---|
| Problem, vision, target industries | [Overview](docs/kt/overview.md) |
| Architecture and technology stack | [Architecture](docs/kt/architecture/README.md) |
| Academic data sources | [Data sources](docs/kt/data-sources/README.md) |
| Multi-agent framework | [Agents](docs/kt/agents/README.md) |
| Opportunity scoring | [Scoring](docs/kt/scoring.md) |
| MVP roadmap | [Roadmap](docs/kt/roadmap.md) |
| Requirements | [Requirements](docs/kt/requirements/README.md) |
| Test strategy | [Test strategy](docs/kt/test/README.md) |
| Checks, CI, secrets | [Operations](docs/kt/operations.md) |
| Decisions | [ADRs](docs/kt/decisions/README.md) |

## Technology stack

Cloudflare Workers, Workflows, Queues, D1, R2, Vectorize, and AI Gateway; Next.js on Cloudflare Pages with Tailwind CSS; LangGraph with OpenAI or Anthropic. Details are in the [technology stack](docs/kt/architecture/technology-stack.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Before opening a pull request:

```bash
python3 -m pip install -r scripts/requirements.txt
python3 scripts/check-config.py
python3 scripts/check-kt.py
```

---

## License

MIT License

---

## Contributors

Built with:

- Cursor
- Claude Code
- GitHub
- Cloudflare
- OpenAI
- Anthropic
- LangGraph

Contributions are welcome.
