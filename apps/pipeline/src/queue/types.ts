/** The slice of the Cloudflare Queues API the pipeline uses. */
export interface QueueSender {
  send(body: unknown, options?: { delaySeconds?: number }): Promise<void>;
}

export interface QueueMessageLike {
  readonly id: string;
  readonly body: unknown;
  readonly attempts: number;
  ack(): void;
  /** `delaySeconds` holds the message back before the next delivery (REQ-DATA-011 AC3). */
  retry(options?: { delaySeconds?: number }): void;
}

export interface QueueBatchLike {
  readonly queue: string;
  readonly messages: readonly QueueMessageLike[];
}
