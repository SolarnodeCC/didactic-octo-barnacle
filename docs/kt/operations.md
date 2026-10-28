---
title: Operations
owner: "@SolarnodeCC"
status: approved
last_reviewed: 2026-10-28
---

# Operations

The repository is specification-only. There is no deployed service, dev server, or application package yet.

## Checks

| Check | Command | Runs in CI |
|---|---|---|
| Configuration | `python3 scripts/check-config.py` | yes |
| KT documents | `python3 scripts/check-kt.py` | yes |
| Workspace | the `install` command in `.cursor/environment.json` | yes |

Install the Python dependency first:

```bash
python3 -m pip install -r scripts/requirements.txt
```

CI is defined in `.github/workflows/config.yml` and runs on every pull request and on pushes to `main`.

## Secrets

Store OpenAlex, model-provider, and Cloudflare credentials in the Cursor environment Secrets tab or in GitHub Actions secrets. Never commit them. When a secret is introduced, add its name and purpose to this document, not its value.

## Branches

Open a pull request. Do not commit directly to `main`.
