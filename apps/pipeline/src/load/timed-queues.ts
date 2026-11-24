import { type QueueBatchLike, type QueueSender } from "../queue/types.js";
import { type VirtualClock } from "./virtual-clock.js";

/** A queue's consumer settings as wrangler.toml sets them (ADR 0047, ADR 0053). */
export type QueueSpec = {
  Name: string;
  BatchSize: number;
  Concurrency: number;
  MaxRetries: number;
};

/** The consumer settings of infrastructure/cloudflare/wrangler.toml, the same in every environment. */
export const WRANGLER_QUEUES = {
  publications: { Name: "roi-publications-load", BatchSize: 1, Concurrency: 1, MaxRetries: 3 },
  documents: { Name: "roi-documents-load", BatchSize: 5, Concurrency: 5, MaxRetries: 3 },
  texts: { Name: "roi-texts-load", BatchSize: 1, Concurrency: 3, MaxRetries: 3 },
  models: { Name: "roi-models-load", BatchSize: 1, Concurrency: 8, MaxRetries: 3 },
  embeddings: { Name: "roi-embeddings-load", BatchSize: 50, Concurrency: 2, MaxRetries: 3 },
} as const satisfies Record<string, QueueSpec>;

export type QueueStats = {
  Name: string;
  Sent: number;
  Deliveries: number;
  Retries: number;
  DeadLettered: number;
  PeakConcurrency: number;
  /** When the queue last finished a batch, as an ISO time; null when it never ran. */
  LastDoneAt: string | null;
};

type Pending = { Id: string; Body: unknown; Attempts: number; AvailableAt: number };

/** Cloudflare's default `max_batch_timeout`, in seconds. */
export const BATCH_TIMEOUT_SECONDS = 5;

/**
 * A Cloudflare queue on the virtual clock: messages wait their delay, and at most `Concurrency`
 * batches of up to `BatchSize` messages are consumed at once by the real consumer. A message
 * that is retried more than `MaxRetries` times goes to the dead-letter queue, as in wrangler.
 * A batch is delivered when it is full or when its oldest message has waited the batch timeout,
 * Cloudflare's default `max_batch_timeout` of 5 s, which wrangler.toml does not change.
 */
export class TimedQueue implements QueueSender {
  private readonly pending: Pending[] = [];
  private inFlight = 0;
  private flushScheduled = false;
  private nextId = 0;
  readonly Stats: QueueStats;
  readonly DeadLetters: unknown[] = [];

  constructor(
    private readonly spec: QueueSpec,
    private readonly clock: VirtualClock,
    private readonly consume: (batch: QueueBatchLike) => Promise<void>,
    private readonly onError: (error: unknown) => void,
  ) {
    this.Stats = {
      Name: spec.Name,
      Sent: 0,
      Deliveries: 0,
      Retries: 0,
      DeadLettered: 0,
      PeakConcurrency: 0,
      LastDoneAt: null,
    };
  }

  send(body: unknown, options?: { delaySeconds?: number }): Promise<void> {
    this.Stats.Sent += 1;
    this.enqueue(
      { Id: `m${(this.nextId += 1)}`, Body: body, Attempts: 0, AvailableAt: 0 },
      options?.delaySeconds ?? 0,
    );
    return Promise.resolve();
  }

  async sendBatch(messages: Iterable<{ body: unknown; delaySeconds?: number }>): Promise<void> {
    for (const message of messages) {
      await this.send(message.body, { delaySeconds: message.delaySeconds ?? 0 });
    }
  }

  /** No message waiting or being consumed. */
  get Idle(): boolean {
    return this.pending.length === 0 && this.inFlight === 0;
  }

  private enqueue(message: Pending, delaySeconds: number): void {
    message.AvailableAt = this.clock.nowMs() + Math.max(0, delaySeconds) * 1000;
    this.pending.push(message);
    if (delaySeconds > 0) {
      void this.clock.sleep(delaySeconds * 1000).then(() => this.pump());
    } else {
      queueMicrotask(() => this.pump());
    }
  }

  private pump(): void {
    while (this.inFlight < this.spec.Concurrency) {
      const now = this.clock.nowMs();
      const ready = this.pending.filter((message) => message.AvailableAt <= now);
      if (ready.length === 0) {
        return;
      }
      // A partial batch waits for more messages until its oldest one has waited the timeout.
      const oldest = Math.min(...ready.map((message) => message.AvailableAt));
      const flushAt = oldest + BATCH_TIMEOUT_SECONDS * 1000;
      if (ready.length < this.spec.BatchSize && now < flushAt) {
        if (!this.flushScheduled) {
          this.flushScheduled = true;
          void this.clock.sleep(flushAt - now).then(() => {
            this.flushScheduled = false;
            this.pump();
          });
        }
        return;
      }
      const batch = ready.slice(0, this.spec.BatchSize);
      for (const message of batch) {
        this.pending.splice(this.pending.indexOf(message), 1);
      }
      this.inFlight += 1;
      this.Stats.PeakConcurrency = Math.max(this.Stats.PeakConcurrency, this.inFlight);
      void this.deliver(batch);
    }
  }

  private async deliver(batch: Pending[]): Promise<void> {
    const outcome = new Map<string, { Retry: number | null }>();
    const messages = batch.map((message) => {
      message.Attempts += 1;
      this.Stats.Deliveries += 1;
      return {
        id: message.Id,
        body: message.Body,
        attempts: message.Attempts,
        ack: () => {
          outcome.set(message.Id, { Retry: null });
        },
        retry: (options?: { delaySeconds?: number }) => {
          outcome.set(message.Id, { Retry: options?.delaySeconds ?? 0 });
        },
      };
    });
    let failed = false;
    try {
      await this.consume({ queue: this.spec.Name, messages });
    } catch (error) {
      // A thrown batch is retried whole, as Cloudflare does.
      failed = true;
      this.onError(error);
    }
    for (const message of batch) {
      const result = outcome.get(message.Id);
      const retry = failed ? 0 : (result?.Retry ?? null);
      if (retry === null) {
        continue;
      }
      if (message.Attempts > this.spec.MaxRetries) {
        this.Stats.DeadLettered += 1;
        this.DeadLetters.push(message.Body);
        continue;
      }
      this.Stats.Retries += 1;
      this.enqueue(message, retry);
    }
    this.inFlight -= 1;
    this.Stats.LastDoneAt = this.clock.now();
    this.pump();
  }
}
