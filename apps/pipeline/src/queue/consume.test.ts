import { describe, expect, it } from "vitest";

import { consumeBatch, RETRY_MAX_SECONDS, retryDelaySeconds } from "./consume.js";
import { type QueueBatchLike } from "./types.js";
import { createHarness } from "../test/harness.js";

describe("REQ-NFR-021: failed queue messages are logged", () => {
  it("REQ-NFR-021: logs the error class, never its text, and retries the message", async () => {
    const h = createHarness();
    const logs: Array<{ event: string; fields: Record<string, unknown> }> = [];
    const deps = {
      ...h.Deps,
      Db: {
        prepare: () => {
          throw new Error("secret https://example.org/?api_key=abc123");
        },
        batch: () => Promise.reject(new Error("unused")),
      },
      Log: (event: string, fields: Record<string, unknown>) => logs.push({ event, fields }),
    };
    const delays: Array<number | undefined> = [];
    const batch: QueueBatchLike = {
      queue: "roi-publications-staging",
      messages: [
        {
          id: "m1",
          body: {
            MessageId: "msg-1",
            Type: "source.fetch_page",
            SchemaVersion: "1",
            RunId: "run-1",
            Source: "openalex",
            Page: { FromDate: "2026-10-01" },
          },
          attempts: 1,
          ack: () => undefined,
          retry: (options?: { delaySeconds?: number }) => {
            delays.push(options?.delaySeconds);
          },
        },
      ],
    } as unknown as QueueBatchLike;

    await consumeBatch(deps, batch, () => 0.5);

    expect(delays).toEqual([30]);
    const failure = logs.find((entry) => entry.event === "queue.message_failed");
    expect(failure?.fields).toEqual({
      queue: "roi-publications-staging",
      error: expect.any(String),
      attempts: 1,
    });
    expect(String(failure?.fields["error"])).toMatch(/^\w+$/); // a class name, not a message
    expect(JSON.stringify(logs)).not.toContain("api_key");
  });
});

describe("REQ-DATA-011: a failed message is retried after a growing delay", () => {
  it("REQ-DATA-011: the delay doubles from 30 seconds per delivery", () => {
    const mid = () => 0.5;
    expect([1, 2, 3, 4].map((attempts) => retryDelaySeconds(attempts, mid))).toEqual([
      30, 60, 120, 240,
    ]);
  });

  it("REQ-DATA-011: the delay never exceeds 15 minutes and keeps its jitter within 20 %", () => {
    expect(retryDelaySeconds(50, () => 0.5)).toBe(RETRY_MAX_SECONDS);
    expect(retryDelaySeconds(1, () => 0)).toBe(24);
    expect(retryDelaySeconds(1, () => 1)).toBe(36);
    expect(retryDelaySeconds(0, () => 0.5)).toBe(30);
  });

  it("REQ-DATA-011: three arXiv retries span minutes, not seconds", () => {
    const total = [1, 2, 3].reduce(
      (sum, attempts) => sum + retryDelaySeconds(attempts, () => 0),
      0,
    );
    expect(total).toBeGreaterThanOrEqual(150);
  });
});
