# Bugbot review rules

- Report secrets, tokens, private keys, or `.env` files committed to the repository.
- Report a mismatch between `LICENSE` and the License section of `README.md`. The project license is MIT.
- Report new runtime services, package manifests, or infrastructure that `docs/kt/architecture/` does not describe, unless the same change updates it.
- Report behavior changes that do not update the affected KT document or requirement in `docs/kt/`.
- Do not request product features that `docs/kt/roadmap.md` lists only as later roadmap phases. The repository may still be specification-only.
- Do not suggest committing environment snapshots, machine-local paths, or Cursor secrets.
