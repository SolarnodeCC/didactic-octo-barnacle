---
title: "0056: Embedding index versioning and backfill"
owner: "@SolarnodeCC"
status: draft
last_reviewed: 2026-11-06
related: [REQ-PROC-001, REQ-PROC-002, REQ-PROC-003, REQ-NFR-020]
---

# 0056: Embedding index versioning and backfill

- Decision status: Proposed
- Date: 2026-11-06

## Context

ADR 0010 versions Vectorize indexes per model as `publications-<model>-<dim>`. ADR 0027 and the bootstrap created one index per environment, `roi-publications-<env>`, with 768 dimensions and cosine distance, for `bge-base-en-v1.5`.

REQ-PROC-001 AC2 requires a backfill on a model change, and search must stay on the old vectors until the backfill is complete. A Worker reaches a Vectorize index only through a binding named in `wrangler.toml`, so it cannot pick an index by name at runtime.

Vectorize applies a metadata index only to vectors written after that index exists.

## Options considered

1. **Rename the existing index** to the ADR 0010 pattern now. It holds no data yet, but renaming means a delete and a create through bootstrap, for no change in behavior.
2. **Keep the existing index for the reference model, and use the ADR 0010 pattern for every later one,** with a second binding during a backfill.
3. **Re-embed in place.** That breaks AC2, because search would read mixed vectors during the backfill.

## Decision

Option 2.

- **Registry:** `embedding_index` lists each index with its binding, Vectorize name, model name and version, dimensions, metric, and `current` flag. The first row is `roi-publications-<env>` on `bge-base-en-v1.5`, bound as `PUBLICATION_VECTORS`, current.
- **New index:** a later model gets `roi-publications-<env>-<model>-<dim>` and the binding `PUBLICATION_VECTORS_NEXT`. Bootstrap creates it with the `source` (string) and `published_day` (number) metadata indexes before the first write.
- **Backfill:** a command queues `publication.embed` for every publication against the new index. Message IDs include the index ID, so the two indexes do not collide.
- **Cut-over:** when every publication has an `embedding` row for the new index, a reviewed configuration change sets it `current`, and search reads it from then on. The next release moves it to `PUBLICATION_VECTORS` and removes the old index.
- **Vector ID:** the vector ID is the publication ID, so a repeated write overwrites it and a deletion needs no lookup.

## Consequences

- ADR 0010 and ADR 0027 stay valid. The reference index keeps its name.
- Every writer and deleter acts on every index in the registry, so a retraction during a backfill removes both vectors (REQ-DATA-008).
- A backfill doubles vector storage until the old index is removed.
