# Security policy

## Reporting a vulnerability

Report a suspected vulnerability privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability**. Do not open a public issue, pull request, or discussion for it.

Include what is affected, how to reproduce it, and the impact you expect. You get an answer within five working days. Please do not test against the staging or production deployments, and do not access data that is not yours.

## Scope

The code and configuration in this repository: the collector Worker in `apps/pipeline`, the packages, the Cloudflare infrastructure in `infrastructure/cloudflare`, and the GitHub Actions workflows. The threat model and controls are in [docs/kt/architecture/security.md](docs/kt/architecture/security.md).

## Secrets

Never put a credential in an issue, a pull request, or a commit. If you find one in the repository or its history, report it as above so it can be revoked.
