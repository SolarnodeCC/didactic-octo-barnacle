import { QueueMessageEnvelopeSchema } from "@roi/models";

import { handleDeadLetter } from "./dead-letter.js";
import { type PipelineDeps } from "./deps.js";
import { handleDocumentIngest } from "./document-ingest.js";
import { handleFetchPage } from "./fetch-page.js";
import { type QueueBatchLike } from "./types.js";

/** Cloudflare names the dead-letter queue `roi-publications-dlq-<env>`. */
export function isDeadLetterQueue(queueName: string): boolean {
  return queueName.includes("-dlq-");
}

/**
 * Handles one delivery batch. A message is acknowledged when its handler returns and
 * retried when it throws; the queue moves it to the dead-letter queue after the last
 * retry (`max_retries` in wrangler.toml, REQ-DATA-011 AC3).
 */
export async function consumeBatch(deps: PipelineDeps, batch: QueueBatchLike): Promise<void> {
  const deadLetters = isDeadLetterQueue(batch.queue);
  for (const message of batch.messages) {
    try {
      if (deadLetters) {
        await handleDeadLetter(deps, message.body);
      } else if (
        QueueMessageEnvelopeSchema.safeParse(message.body).data?.Type === "document.ingest"
      ) {
        await handleDocumentIngest(deps, message.body);
      } else {
        await handleFetchPage(deps, message.body);
      }
      message.ack();
    } catch {
      message.retry();
    }
  }
}
