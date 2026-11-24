import { FakeWorkersAi } from "@roi/models";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { queueAdmittedExtractions } from "./queue-extractions.js";
import { pacedDelaySeconds } from "../queue/deps.js";
import { createHarness, type Harness } from "../test/harness.js";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("REQ-TEST-003: unexpected network fetch"))),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const DAY = "2026-10-30";

/** `count` publications admitted for extraction today, with no extraction yet. */
async function admitted(count: number): Promise<Harness> {
  const h = createHarness(
    {},
    {
      Triage: { Ai: new FakeWorkersAi([]), Send: false },
      Extraction: { Ai: new FakeWorkersAi([]) },
    },
  );
  for (let i = 1; i <= count; i += 1) {
    h.Database.Raw.prepare(
      `INSERT INTO publication (id, title, completeness, created_at, updated_at)
       VALUES (?, 'Title', 'complete', ?, ?)`,
    ).run(`pub_${i}`, `${DAY}T06:00:00.000Z`, `${DAY}T06:00:00.000Z`);
    h.Database.Raw.prepare(
      `INSERT INTO triage_decision (id, publication_id, run_id, status, accepted, reason,
         admitted_on, created_at, updated_at)
       VALUES (?, ?, 'run_seed', 'decided', 1, 'accepted', ?, ?, ?)`,
    ).run(`tri_${i}`, `pub_${i}`, DAY, `${DAY}T06:00:00.000Z`, `${DAY}T06:00:00.000Z`);
  }
  h.Clock.Now = `${DAY}T11:00:00.000Z`;
  return h;
}

describe("REQ-NFR-010: extraction is sent paced to the model's request limit (ADR 0118)", () => {
  it("REQ-NFR-010: AC2 spaces the sends 3 s apart at 20 requests a minute", () => {
    expect([0, 1, 2, 99].map((i) => pacedDelaySeconds(i, 20))).toEqual([0, 3, 6, 297]);
    expect(pacedDelaySeconds(5, undefined)).toBe(0);
    expect(pacedDelaySeconds(5, 0)).toBe(0);
  });

  it("REQ-NFR-010: AC2 admitted extractions are queued 3 s apart, after the re-driven ones", async () => {
    const h = await admitted(4);
    const extraction = h.Deps.Extraction;
    if (!extraction) {
      throw new Error("extraction is not configured");
    }
    extraction.RequestsPerMinute = 20;
    expect(await queueAdmittedExtractions(h.Deps, DAY, 2)).toBe(4);
    expect(h.Queue.sent.map((message) => message.delaySeconds)).toEqual([6, 9, 12, 15]);
  });

  it("REQ-NFR-010: AC2 without a configured limit the extractions are sent at once", async () => {
    const h = await admitted(3);
    expect(await queueAdmittedExtractions(h.Deps, DAY)).toBe(3);
    expect(h.Queue.sent.map((message) => message.delaySeconds)).toEqual([0, 0, 0]);
  });
});
