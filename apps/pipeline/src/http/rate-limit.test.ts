import { describe, expect, it } from "vitest";

import { ARXIV_MIN_REQUEST_INTERVAL_MS, createRateLimiter } from "./rate-limit.js";

describe("REQ-DATA-002: arXiv rate limit", () => {
  it("REQ-DATA-002: spaces back-to-back requests at least three seconds apart", async () => {
    let now = 0;
    const starts: number[] = [];
    const wait = createRateLimiter({
      MinIntervalMs: ARXIV_MIN_REQUEST_INTERVAL_MS,
      Now: () => now,
      Sleep: (ms) => {
        now += ms;
        return Promise.resolve();
      },
    });

    for (let request = 0; request < 3; request += 1) {
      await wait();
      starts.push(now);
    }
    expect(starts).toEqual([0, 3000, 6000]);
  });

  it("REQ-DATA-002: does not wait when enough time has passed", async () => {
    let now = 0;
    let slept = 0;
    const wait = createRateLimiter({
      MinIntervalMs: 3000,
      Now: () => now,
      Sleep: (ms) => {
        slept += ms;
        return Promise.resolve();
      },
    });
    await wait();
    now = 10_000;
    await wait();
    expect(slept).toBe(0);
  });
});
