import { QueueMessageEnvelopeSchema } from "@roi/models";

import { handleDeadLetter } from "./dead-letter.js";
import { type PipelineDeps } from "./deps.js";
import { handleDocumentIngest } from "./document-ingest.js";
import { handleFetchPage } from "./fetch-page.js";
import { type QueueBatchLike } from "./types.js";

/** Dead-letter queues are named `roi-<queue>-dlq-<env>`, for pages and for PDFs (ADR 0047). */
export function isDeadLetterQueue(queueName: string): boolean {
  return queueName.includes("-dlq-");
}

/** First retry delay; it doubles for each later delivery (ADR 0045). */
export const RETRY_BASE_SECONDS = 30;
/** Longest retry delay, so a run still finishes well inside its timeout. */
export const RETRY_MAX_SECONDS = 900;

/**
 * Delay before the next delivery of a message that failed on delivery `attempts` (1 for
 * the first delivery): 30 s, 60 s, 120 s, ... up to 15 minutes, with ±20 % jitter so
 * messages that failed together do not all come back at the same moment. An upstream
 * outage of a few minutes then no longer uses up every retry (REQ-DATA-011 AC3).
 */
export function retryDelaySeconds(attempts: number, random: () => number = Math.random): number {
  const exponent = Math.max(0, Math.floor(attempts) - 1);
  const base = Math.min(RETRY_BASE_SECONDS * 2 ** exponent, RETRY_MAX_SECONDS);
  return Math.max(1, Math.round(base * (0.8 + 0.4 * random())));
}

/**
 * Handles one delivery batch. A message is acknowledged when its handler returns and
 * retried with a growing delay when it throws; the queue moves it to the dead-letter queue
 * after the last retry (`max_retries` in wrangler.toml, REQ-DATA-011 AC3).
 */
export async function consumeBatch(
  deps: PipelineDeps,
  batch: QueueBatchLike,
  random: () => number = Math.random,
): Promise<void> {
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
    } catch (error) {
      // The name only: a message can carry a URL or other text that does not belong in a log.
      deps.Log?.("queue.message_failed", {
        queue: batch.queue,
        error: error instanceof Error ? error.name : "unknown",
        attempts: message.attempts,
      });
      message.retry({ delaySeconds: retryDelaySeconds(message.attempts, random) });
    }
  }
}
