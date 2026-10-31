import { describe, expect, it } from "vitest";

import { consumeBatch } from "./consume.js";
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
    let retried = 0;
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
          retry: () => {
            retried += 1;
          },
        },
      ],
    } as unknown as QueueBatchLike;

    await consumeBatch(deps, batch);

    expect(retried).toBe(1);
    const failure = logs.find((entry) => entry.event === "queue.message_failed");
    expect(failure?.fields).toEqual({
      queue: "roi-publications-staging",
      error: expect.any(String),
    });
    expect(String(failure?.fields["error"])).toMatch(/^\w+$/); // a class name, not a message
    expect(JSON.stringify(logs)).not.toContain("api_key");
  });
});
