import { describe, expect, it } from "vitest";

import {
  CROSS_INDUSTRY_ARXIV_CATEGORIES,
  CROSS_INDUSTRY_OPENALEX_TOPIC_NAMES,
  INDUSTRY_TOPIC_MAP,
  SCOPE_ARXIV_CATEGORIES,
  SCOPE_OPENALEX_TOPIC_NAMES,
  TARGET_INDUSTRIES,
  industriesForTopics,
  isArxivCategoryInScope,
  isOpenAlexTopicsInScope,
} from "./scope.js";

describe("REQ-PROC-006: topic map of the eight target industries (ADR 0037, ADR 0038)", () => {
  it("REQ-PROC-006: the map has a row for each of the eight industries and none for other", () => {
    expect([...TARGET_INDUSTRIES]).toEqual([
      "automotive",
      "aerospace-defense",
      "consumer-retail",
      "energy-utilities",
      "banking",
      "insurance",
      "public-sector",
      "life-sciences",
    ]);
    expect(Object.keys(INDUSTRY_TOPIC_MAP).sort()).toEqual([...TARGET_INDUSTRIES].sort());
  });

  it("REQ-PROC-006: every industry names OpenAlex subfields and arXiv categories without duplicates", () => {
    for (const industry of TARGET_INDUSTRIES) {
      const row = INDUSTRY_TOPIC_MAP[industry];
      expect(row.OpenAlex.length, `${industry} OpenAlex`).toBeGreaterThan(0);
      expect(row.Arxiv.length, `${industry} arXiv`).toBeGreaterThan(0);
      expect(new Set(row.OpenAlex.map((v) => v.toLowerCase())).size).toBe(row.OpenAlex.length);
      expect(new Set(row.Arxiv.map((v) => v.toLowerCase())).size).toBe(row.Arxiv.length);
    }
  });

  it("REQ-PROC-006: the flat scope lists hold each name once and include every industry row", () => {
    expect(new Set(SCOPE_ARXIV_CATEGORIES).size).toBe(SCOPE_ARXIV_CATEGORIES.length);
    expect(new Set(SCOPE_OPENALEX_TOPIC_NAMES).size).toBe(SCOPE_OPENALEX_TOPIC_NAMES.length);
    for (const industry of TARGET_INDUSTRIES) {
      for (const name of INDUSTRY_TOPIC_MAP[industry].OpenAlex) {
        expect(SCOPE_OPENALEX_TOPIC_NAMES).toContain(name);
      }
      for (const category of INDUSTRY_TOPIC_MAP[industry].Arxiv) {
        expect(SCOPE_ARXIV_CATEGORIES).toContain(category);
      }
    }
    for (const category of CROSS_INDUSTRY_ARXIV_CATEGORIES) {
      expect(SCOPE_ARXIV_CATEGORIES).toContain(category);
    }
    for (const name of CROSS_INDUSTRY_OPENALEX_TOPIC_NAMES) {
      expect(SCOPE_OPENALEX_TOPIC_NAMES).toContain(name);
    }
  });

  it("REQ-PROC-006: a topic of each previously unmapped industry is in scope and maps back to it", () => {
    const cases: Array<[string, string, string]> = [
      ["automotive", "Automotive Engineering", "cs.RO"],
      ["aerospace-defense", "Aerospace Engineering", "astro-ph.IM"],
      ["consumer-retail", "Marketing", "cs.IR"],
      ["energy-utilities", "Energy Engineering and Power Technology", "math.OC"],
    ];
    for (const [industry, subfield, category] of cases) {
      expect(isOpenAlexTopicsInScope([subfield], SCOPE_OPENALEX_TOPIC_NAMES)).toBe(true);
      expect(isArxivCategoryInScope([category])).toBe(true);
      expect(industriesForTopics({ OpenAlexNames: [subfield] })).toContain(industry);
      expect(industriesForTopics({ ArxivCategories: [category] })).toContain(industry);
    }
  });

  it("REQ-PROC-006: matching ignores case and a topic outside the map stays out", () => {
    expect(isOpenAlexTopicsInScope(["aerospace ENGINEERING"], SCOPE_OPENALEX_TOPIC_NAMES)).toBe(
      true,
    );
    expect(isOpenAlexTopicsInScope(["Aquatic Science"], SCOPE_OPENALEX_TOPIC_NAMES)).toBe(false);
    expect(isArxivCategoryInScope(["math.NT"])).toBe(false);
    expect(
      industriesForTopics({ OpenAlexNames: ["Aquatic Science"], ArxivCategories: ["math.NT"] }),
    ).toEqual([]);
  });

  it("REQ-PROC-006: the pilot cross-industry arXiv categories stay in scope", () => {
    for (const category of ["cs.AI", "cs.SE", "cs.HC", "cs.CY"]) {
      expect(isArxivCategoryInScope([category])).toBe(true);
    }
  });
});
