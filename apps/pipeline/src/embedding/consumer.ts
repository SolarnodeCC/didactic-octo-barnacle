import { QueueMessageEnvelopeSchema, callEmbedding, type QueueMessageEnvelope } from "@roi/models";
import {
  embeddingInput,
  publishedDay,
  upsertPublicationVectors,
  type IndexEntry,
} from "@roi/vector-store";

import { type PipelineDeps } from "../queue/deps.js";
import { claimMessage, completeStatement, markFailed } from "../queue/log.js";
import { type QueueMessageLike } from "../queue/types.js";
import { checkBreaker, isPaused } from "../recovery/breaker.js";
import {
  addRunCountStatements,
  recordFailureStatement,
  type FailureClass,
} from "../recovery/redrive-repo.js";
import { registryIndexes } from "../store/embedding-index-repo.js";
import { dailyRunId } from "../store/processing-run-repo.js";
import { type SqlStatement } from "../store/sql.js";

type Claimed = { Message: QueueMessageLike; Envelope: QueueMessageEnvelope };

type PublicationRow = {
  id: string;
  title: string;
  abstract: string | null;
  published_at: string | null;
  retracted: number;
  source: string | null;
};

/**
 * Consumer of `publication.embed` (REQ-PROC-001, REQ-PROC-002, ADR 0053, ADR 0056). A delivery
 * batch of up to 50 messages is embedded with one model call per index, through AI Gateway; the
 * vectors are written with the publication ID as vector ID and `source` and `published_day` as
 * metadata, then the `embedding` rows and the message states in one D1 batch.
 *
 * A publication already embedded in that index, or retracted, is not embedded (REQ-PROC-010 AC7,
 * REQ-DATA-008). A step refused by the budget, paused by the breaker, or failing all its attempts
 * completes its messages with the reason and records them in `redrive` (ADR 0063).
 */
export async function handleEmbeddingMessages(
  deps: PipelineDeps,
  messages: readonly QueueMessageLike[],
  retryDelay: (attempts: number) => number,
): Promise<void> {
  const claimed: Claimed[] = [];
  for (const message of messages) {
    const envelope = QueueMessageEnvelopeSchema.parse(message.body);
    const claim = await claimMessage(deps.Db, envelope, deps.Now());
    if (claim === "claimed") {
      claimed.push({ Message: message, Envelope: envelope });
    } else {
      message.ack();
    }
  }
  if (claimed.length === 0) {
    return;
  }
  try {
    await embed(deps, claimed);
    for (const item of claimed) {
      item.Message.ack();
    }
  } catch (error) {
    deps.Log?.("embedding.failed", {
      messages: claimed.length,
      error: error instanceof Error ? error.message : String(error),
    });
    for (const item of claimed) {
      await markFailed(deps.Db, item.Envelope.MessageId, error, deps.Now());
      item.Message.retry({ delaySeconds: retryDelay(item.Message.attempts) });
    }
  }
}

async function embed(deps: PipelineDeps, claimed: Claimed[]): Promise<void> {
  const embedding = deps.Embedding;
  if (!embedding) {
    throw new Error("embedding is not configured in this Worker");
  }
  const db = deps.Db;
  const indexes = new Map(
    (await registryIndexes(db, embedding.Environment)).map((entry) => [entry.Id, entry]),
  );
  const completions: SqlStatement[] = [];
  const work = new Map<string, Array<{ Item: Claimed; Publication: PublicationRow }>>();

  for (const item of claimed) {
    const { PublicationId: publicationId, IndexId: indexId } = item.Envelope.Ids;
    if (item.Envelope.Type !== "publication.embed" || !publicationId || !indexId) {
      throw new Error("publication.embed needs a PublicationId and an IndexId");
    }
    const complete = (note: string) =>
      completions.push(completeStatement(db, item.Envelope.MessageId, deps.Now(), note));
    if (!indexes.has(indexId)) {
      complete("no such index");
      continue;
    }
    const existing = await db
      .prepare(
        "SELECT 1 AS found FROM embedding WHERE publication_id = ? AND embedding_index_id = ?",
      )
      .bind(publicationId, indexId)
      .first<{ found: number }>();
    if (existing) {
      complete("already embedded");
      continue;
    }
    const publication = await db
      .prepare(
        `SELECT p.id, p.title, p.abstract, p.published_at, p.retracted,
           (SELECT sr.source FROM source_record sr WHERE sr.publication_id = p.id
            ORDER BY sr.fetched_at, sr.id LIMIT 1) AS source
         FROM publication p WHERE p.id = ?`,
      )
      .bind(publicationId)
      .first<PublicationRow>();
    if (!publication) {
      complete("no such publication");
      continue;
    }
    // A retracted publication is never embedded (REQ-DATA-008, REQ-PROC-002 AC2).
    if (publication.retracted === 1) {
      complete("retracted");
      continue;
    }
    work.set(indexId, [...(work.get(indexId) ?? []), { Item: item, Publication: publication }]);
  }
  if (completions.length > 0) {
    await db.batch(completions);
  }

  const now = deps.Now();
  const runId = await dailyRunId(db, now.slice(0, 10), now, deps.NewId);
  for (const [indexId, items] of work) {
    await embedGroup(deps, indexes.get(indexId) as IndexEntry, items, runId);
  }
}

async function embedGroup(
  deps: PipelineDeps,
  entry: IndexEntry,
  items: Array<{ Item: Claimed; Publication: PublicationRow }>,
  runId: string,
): Promise<void> {
  const embedding = deps.Embedding as NonNullable<PipelineDeps["Embedding"]>;
  const db = deps.Db;
  const fail = (failureClass: FailureClass, note: string) =>
    db.batch(
      items.flatMap(({ Item, Publication }) => [
        recordFailureStatement(
          db,
          {
            ItemKind: "publication",
            ItemId: Publication.id,
            Step: "embedding",
            Class: failureClass,
            Model: entry.ModelName,
            PromptVersion: null,
          },
          deps.Now(),
          `rd_${deps.NewId()}`,
        ),
        completeStatement(db, Item.Envelope.MessageId, deps.Now(), note),
      ]),
    );

  const index = embedding.Indexes[entry.Binding];
  if (!index) {
    throw new Error(`no Vectorize binding ${entry.Binding} in this Worker`);
  }
  // A paused step makes no call: the items wait as budget-deferred (REQ-PROC-010 AC6).
  if (await isPaused(db, "embedding")) {
    await fail("transient", "budget-deferred: the embedding step is paused");
    return;
  }
  const inputs = items.map(({ Publication }) =>
    embeddingInput(Publication.title, Publication.abstract),
  );
  const result = await callEmbedding(embedding.Call, {
    RunKind: "processing",
    RunId: runId,
    StepName: "embedding",
    Model: entry.ModelName,
    Texts: inputs.map((input) => input.Text),
  });
  if (!result.Ok) {
    if (result.Reason === "budget-exhausted") {
      await fail("transient", "budget-deferred");
      deps.Log?.("embedding.budget_deferred", { count: items.length });
      return;
    }
    await fail(
      result.Reason === "invalid-output" ? "content" : "transient",
      `failed: ${result.Reason}: ${result.Errors.join("; ")}`,
    );
    if (result.Reason === "provider-error") {
      await checkBreaker(deps, "embedding");
    }
    return;
  }

  // Vectors first: a repeated write overwrites the same vector, so a retry after a failed D1
  // batch leaves no orphan (ADR 0056).
  await upsertPublicationVectors(
    index,
    items.map(({ Publication }, i) => ({
      id: Publication.id,
      values: result.Vectors[i] ?? [],
      metadata: {
        source: Publication.source ?? "unknown",
        published_day: publishedDay(Publication.published_at),
      },
    })),
  );
  const now = deps.Now();
  const titleOnly = inputs.filter((input) => input.Kind === "title-only").length;
  await db.batch([
    ...items.map(({ Publication }, i) =>
      db
        .prepare(
          `INSERT INTO embedding (id, publication_id, embedding_index_id, vectorize_id, model_name,
             model_version, input_kind, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (publication_id, embedding_index_id) DO NOTHING`,
        )
        .bind(
          `emb_${deps.NewId()}`,
          Publication.id,
          entry.Id,
          Publication.id,
          entry.ModelName,
          entry.ModelVersion,
          inputs[i]?.Kind ?? "title-abstract",
          now,
        ),
    ),
    ...items.map(({ Item }) => completeStatement(db, Item.Envelope.MessageId, now)),
    ...addRunCountStatements(db, runId, { Embedded: items.length, EmbeddedTitleOnly: titleOnly }),
  ]);
  deps.Log?.("embedding.stored", { index: entry.Id, count: items.length, titleOnly });
}
