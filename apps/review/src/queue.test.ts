import { describe, expect, it } from "vitest";

import { drawSample, sampleSize, STRATUM_SHARES, type PoolItem } from "./queue.js";

function item(n: number, overrides: Partial<PoolItem> = {}): PoolItem {
  return {
    PublicationId: `pub-${String(n).padStart(3, "0")}`,
    Accepted: true,
    Reason: "accepted",
    Score: 1,
    ModelDecided: true,
    HasExtraction: true,
    VisibleCandidates: 2,
    Confidence: 0.7,
    NewPrompt: false,
    ...overrides,
  };
}

/** 100 plain items plus 10 of each special kind. */
function pool(): PoolItem[] {
  const items: PoolItem[] = [];
  for (let n = 0; n < 100; n += 1) items.push(item(n));
  for (let n = 100; n < 110; n += 1) items.push(item(n, { Score: 0.6 }));
  for (let n = 110; n < 120; n += 1) items.push(item(n, { VisibleCandidates: 0 }));
  for (let n = 120; n < 130; n += 1) items.push(item(n, { Confidence: 0.3 }));
  for (let n = 130; n < 140; n += 1)
    items.push(item(n, { Accepted: false, Reason: "low-score", Score: 0.2, HasExtraction: false }));
  for (let n = 140; n < 150; n += 1) items.push(item(n, { NewPrompt: true }));
  return items;
}

describe("REQ-REV-006: daily sample", () => {
  it("REQ-REV-006: draws the same sample for the same day, whatever the pool order", () => {
    const a = drawSample(pool(), 20, "2026-11-24");
    const b = drawSample([...pool()].reverse(), 20, "2026-11-24");
    expect(a).toEqual(b);
    expect(drawSample(pool(), 20, "2026-11-25")).not.toEqual(a);
  });

  it("REQ-REV-006: fills each stratum up to its share and random takes the rest", () => {
    const sample = drawSample(pool(), 20, "2026-11-24");
    expect(sample).toHaveLength(20);
    expect(new Set(sample.map((s) => s.PublicationId)).size).toBe(20);
    const count = (stratum: string) => sample.filter((s) => s.Stratum === stratum).length;
    for (const [stratum, share] of STRATUM_SHARES) {
      expect(count(stratum), stratum).toBe(Math.floor(20 * share));
    }
    expect(count("random")).toBe(
      20 - STRATUM_SHARES.reduce((n, [, share]) => n + Math.floor(20 * share), 0),
    );
  });

  it("REQ-REV-006: classifies borderline as one signal from the cut and skips rule decisions", () => {
    const sample = drawSample(
      [
        item(1, { Score: 0.4, Accepted: false, Reason: "low-score" }),
        item(2, { Score: null, ModelDecided: false, Accepted: false, Reason: "incomplete" }),
      ],
      20,
      "2026-11-24",
    );
    expect(sample.find((s) => s.PublicationId === "pub-001")?.Stratum).toBe("borderline");
    expect(sample.find((s) => s.PublicationId === "pub-002")?.Stratum).toBe("random");
  });

  it("REQ-REV-006: takes the whole pool when it is smaller than the sample", () => {
    expect(drawSample([item(1), item(2)], 20, "2026-11-24")).toHaveLength(2);
    expect(drawSample([], 20, "2026-11-24")).toEqual([]);
  });

  it("REQ-REV-006: reads the sample size from the setting, between 5 and 100", () => {
    expect(sampleSize(undefined)).toBe(20);
    expect(sampleSize("30")).toBe(30);
    expect(sampleSize("1")).toBe(5);
    expect(sampleSize("1000")).toBe(100);
    expect(sampleSize("many")).toBe(20);
  });
});
