import { QueueMessageEnvelopeSchema } from "@roi/models";

import { PdfFetchError } from "../documents/safe-fetch.js";
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

/** First retry delay after a 429 from a PDF host; it doubles for each later delivery (ADR 0069). */
export const RATE_LIMIT_BASE_SECONDS = 300;
/** Longest retry delay after a 429, also the cap on a `Retry-After` from the host. */
export const RATE_LIMIT_MAX_SECONDS = 3600;

/**
 * Delay before the next delivery of a PDF message that a host refused with HTTP 429:
 * 5 minutes, 10, 20, ... up to an hour, or the host's `Retry-After` when that is longer,
 * itself capped at an hour (REQ-DATA-011 AC6, REQ-NFR-021). A host that limits requests
 * needs minutes, not the seconds of the delay for other errors. Jitter of ±20 % keeps
 * messages for the same host from coming back together. PDF messages hold up no run
 * (ADR 0047), so the longer wait costs nothing.
 */
export function rateLimitDelaySeconds(
  attempts: number,
  retryAfterSeconds: number | null,
  random: () => number = Math.random,
): number {
  const exponent = Math.max(0, Math.floor(attempts) - 1);
  const schedule = Math.min(RATE_LIMIT_BASE_SECONDS * 2 ** exponent, RATE_LIMIT_MAX_SECONDS);
  const asked =
    retryAfterSeconds === null
      ? 0
      : Math.min(Math.max(0, retryAfterSeconds), RATE_LIMIT_MAX_SECONDS);
  return Math.max(1, Math.round(Math.max(schedule, asked) * (0.8 + 0.4 * random())));
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
        await handleDocumentIngest(deps, message.body, { Attempts: message.attempts });
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
      const rateLimited = error instanceof PdfFetchError && error.Status === 429;
      message.retry({
        delaySeconds: rateLimited
          ? rateLimitDelaySeconds(message.attempts, error.RetryAfterSeconds, random)
          : retryDelaySeconds(message.attempts, random),
      });
    }
  }
}
