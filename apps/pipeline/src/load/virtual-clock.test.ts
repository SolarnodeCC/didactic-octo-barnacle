import { describe, expect, it } from "vitest";

import { seededRandom } from "./timed-workers-ai.js";
import { VirtualClock } from "./virtual-clock.js";

describe("REQ-NFR-010: the load test's virtual clock (ADR 0118)", () => {
  it("REQ-NFR-010: AC1 runs timers in time order and jumps over idle time", async () => {
    const clock = new VirtualClock("2026-11-24T06:00:00.000Z");
    const seen: string[] = [];
    clock.at(
      "2026-11-24T11:00:00.000Z",
      () => Promise.resolve(seen.push(`b ${clock.now()}`)),
      () => undefined,
    );
    clock.at(
      "2026-11-24T07:30:00.000Z",
      async () => {
        seen.push(`a ${clock.now()}`);
        await clock.sleep(60_000);
        seen.push(`a+1m ${clock.now()}`);
      },
      () => undefined,
    );
    await clock.run();
    expect(seen).toEqual([
      "a 2026-11-24T07:30:00.000Z",
      "a+1m 2026-11-24T07:31:00.000Z",
      "b 2026-11-24T11:00:00.000Z",
    ]);
  });

  it("REQ-NFR-010: AC1 stops at the given time and leaves later timers waiting", async () => {
    const clock = new VirtualClock("2026-11-24T06:00:00.000Z");
    let ran = false;
    clock.at(
      "2026-11-25T07:00:00.000Z",
      () => Promise.resolve((ran = true)),
      () => undefined,
    );
    await clock.run("2026-11-25T06:00:00.000Z");
    expect(ran).toBe(false);
    expect(clock.now()).toBe("2026-11-24T06:00:00.000Z");
  });

  it("REQ-NFR-010: AC2 the seeded generator repeats exactly", () => {
    const a = seededRandom(7);
    const b = seededRandom(7);
    const first = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(first);
    expect(first.every((value) => value >= 0 && value < 1)).toBe(true);
  });
});
