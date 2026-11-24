import { describe, expect, it } from "vitest";

import { TimedQueue } from "./timed-queues.js";
import { VirtualClock } from "./virtual-clock.js";
import { type QueueBatchLike } from "../queue/types.js";

const START = "2026-11-24T06:00:00.000Z";

describe("REQ-NFR-010: queues on the virtual clock behave as wrangler sets them (ADR 0118)", () => {
  it("REQ-NFR-010: AC1 consumes at most the concurrency in batches of the batch size", async () => {
    const clock = new VirtualClock(START);
    const sizes: number[] = [];
    let busy = 0;
    let peak = 0;
    const queue = new TimedQueue(
      { Name: "roi-embeddings-test", BatchSize: 50, Concurrency: 2, MaxRetries: 3 },
      clock,
      async (batch: QueueBatchLike) => {
        busy += 1;
        peak = Math.max(peak, busy);
        sizes.push(batch.messages.length);
        await clock.sleep(1_000);
        busy -= 1;
      },
      () => undefined,
    );
    for (let i = 0; i < 230; i += 1) {
      await queue.send({ n: i });
    }
    await clock.run();
    expect(sizes).toEqual([50, 50, 50, 50, 30]);
    expect(peak).toBe(2);
    expect(queue.Stats).toMatchObject({ Deliveries: 230, PeakConcurrency: 2 });
    // Four full batches go at once, two at a time; the last 30 wait the 5 s batch timeout.
    expect(clock.now()).toBe("2026-11-24T06:00:06.000Z");
  });

  it("REQ-NFR-010: AC2 honours a retry delay and dead-letters after the last retry", async () => {
    const clock = new VirtualClock(START);
    const deliveredAt: string[] = [];
    const queue = new TimedQueue(
      { Name: "roi-models-test", BatchSize: 1, Concurrency: 8, MaxRetries: 2 },
      clock,
      (batch) => {
        deliveredAt.push(clock.now());
        for (const message of batch.messages) {
          message.retry({ delaySeconds: 30 });
        }
        return Promise.resolve();
      },
      () => undefined,
    );
    await queue.send({ n: 1 });
    await clock.run();
    expect(deliveredAt).toEqual([
      "2026-11-24T06:00:00.000Z",
      "2026-11-24T06:00:30.000Z",
      "2026-11-24T06:01:00.000Z",
    ]);
    expect(queue.Stats).toMatchObject({ Retries: 2, DeadLettered: 1 });
  });

  it("REQ-NFR-010: AC2 a delayed send waits its delay", async () => {
    const clock = new VirtualClock(START);
    const deliveredAt: string[] = [];
    const queue = new TimedQueue(
      { Name: "roi-models-test", BatchSize: 1, Concurrency: 8, MaxRetries: 3 },
      clock,
      () => {
        deliveredAt.push(clock.now());
        return Promise.resolve();
      },
      () => undefined,
    );
    await queue.sendBatch([
      { body: 1 },
      { body: 2, delaySeconds: 3 },
      { body: 3, delaySeconds: 6 },
    ]);
    await clock.run();
    expect(deliveredAt).toEqual([
      "2026-11-24T06:00:00.000Z",
      "2026-11-24T06:00:03.000Z",
      "2026-11-24T06:00:06.000Z",
    ]);
  });
});
