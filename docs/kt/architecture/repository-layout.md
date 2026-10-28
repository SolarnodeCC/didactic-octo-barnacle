---
title: Repository layout
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-28
---

# Repository layout

The planned layout once code exists:

```text
├── apps
│   ├── dashboard
│   └── api
├── agents
│   ├── research-agent
│   ├── startup-agent
│   └── scoring-agent
├── packages
│   ├── vector-store
│   ├── prompts
│   └── models
├── infrastructure
│   └── cloudflare
├── docs
│   └── kt
└── scripts
```

`docs/kt` and `scripts` exist today. The other directories are not implemented yet. When an application is added, extend the `install` command in `.cursor/environment.json` and the `setup-worktree` commands in `.cursor/worktrees.json`.
