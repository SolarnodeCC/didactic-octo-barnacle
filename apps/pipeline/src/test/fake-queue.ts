import { type QueueBatchLike, type QueueMessageLike, type QueueSender } from "../queue/types.js";

type Pending = { id: string; body: unknown; attempts: number; delaySeconds: number };

export type DrainOptions = {
  /** Retries before a message goes to the dead-letter queue (`max_retries`). */
  MaxRetries: number;
  /** Deliver every message twice, as an at-least-once queue may (REQ-DATA-011). */
  Duplicate?: boolean;
  Consume: (batch: QueueBatchLike) => Promise<void>;
};

/**
 * A queue in memory with at-least-once delivery, retries, and a dead-letter queue.
 * It stands in for Cloudflare Queues in integration tests (REQ-TEST-003).
 */
export class FakeQueue implements QueueSender {
  static readonly QUEUE = "roi-publications-test";
  static readonly DLQ = "roi-publications-dlq-test";

  readonly sent: Array<{ body: unknown; delaySeconds: number }> = [];
  readonly deadLettered: unknown[] = [];
  private pending: Pending[] = [];
  private nextId = 0;

  send(body: unknown, options?: { delaySeconds?: number }): Promise<void> {
    const delaySeconds = options?.delaySeconds ?? 0;
    this.sent.push({ body, delaySeconds });
    this.pending.push({ id: `q${(this.nextId += 1)}`, body, attempts: 0, delaySeconds });
    return Promise.resolve();
  }

  get size(): number {
    return this.pending.length;
  }

  /** Deliver until nothing is left; returns the number of deliveries made. */
  async drain(options: DrainOptions): Promise<number> {
    let deliveries = 0;
    while (this.pending.length > 0) {
      const item = this.pending.shift() as Pending;
      const times = options.Duplicate ? 2 : 1;
      let acked = false;
      for (let time = 0; time < times; time += 1) {
        deliveries += 1;
        acked = (await this.deliver(options.Consume, FakeQueue.QUEUE, item)) || acked;
        if (!acked) {
          break;
        }
      }
      if (!acked) {
        item.attempts += 1;
        if (item.attempts > options.MaxRetries) {
          this.deadLettered.push(item.body);
          await this.deliver(options.Consume, FakeQueue.DLQ, { ...item, attempts: 0 });
        } else {
          this.pending.push(item);
        }
      }
    }
    return deliveries;
  }

  private async deliver(
    consume: DrainOptions["Consume"],
    queue: string,
    item: Pending,
  ): Promise<boolean> {
    let acked = false;
    const message: QueueMessageLike = {
      id: item.id,
      body: item.body,
      attempts: item.attempts + 1,
      ack: () => {
        acked = true;
      },
      retry: () => {
        acked = false;
      },
    };
    try {
      await consume({ queue, messages: [message] });
    } catch {
      acked = false;
    }
    return acked;
  }
}
