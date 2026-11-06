/** The slice of the Cloudflare Queues API the pipeline uses. */
export interface QueueSender {
  send(body: unknown, options?: { delaySeconds?: number }): Promise<void>;
  /** One request for up to 100 messages (Cloudflare Queues limit). */
  sendBatch(messages: Iterable<{ body: unknown; delaySeconds?: number }>): Promise<void>;
}

/** Most messages one `sendBatch` call may carry. */
export const SEND_BATCH_LIMIT = 100;

export interface QueueMessageLike {
  readonly id: string;
  readonly body: unknown;
  readonly attempts: number;
  ack(): void;
  retry(): void;
}

export interface QueueBatchLike {
  readonly queue: string;
  readonly messages: readonly QueueMessageLike[];
}
