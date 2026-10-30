import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseArxivFeed } from "./parse-feed.js";

const feed = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../fixtures/arxiv/feed.xml"),
  "utf8",
);

describe("REQ-DATA-002: arXiv Atom feed parsing", () => {
  it("REQ-DATA-002: parses entries into ArxivEntry records", () => {
    const [first] = parseArxivFeed(feed);
    expect(first).toEqual({
      id: "http://arxiv.org/abs/2410.00001v2",
      title: "Agents for\n      public administration",
      summary: "We study agents that help civil servants.",
      published: "2026-10-10T09:00:00Z",
      updated: "2026-10-12T10:00:00Z",
      categories: ["cs.CY", "cs.AI"],
      primaryCategory: "cs.CY",
      authors: [{ name: "Grace Hopper", affiliation: "Navy Lab" }, { name: "Alan Turing" }],
      doi: "10.5555/agents.2026",
      pdfUrl: "http://arxiv.org/pdf/2410.00001v2",
    });
  });

  it("REQ-DATA-002: reads the primary category apart from cross-listed ones", () => {
    const entries = parseArxivFeed(feed);
    expect(entries.map((entry) => entry.primaryCategory)).toEqual(["cs.CY", "cs.LG", "cs.LG"]);
    expect(entries[1]?.categories).toEqual(["cs.LG", "cs.HC"]);
  });

  it("REQ-DATA-002: flags a withdrawn preprint from its comment", () => {
    const entries = parseArxivFeed(feed);
    expect(entries.map((entry) => entry.withdrawn ?? false)).toEqual([false, false, true]);
  });

  it("REQ-DATA-002: returns no entries for an empty feed", () => {
    expect(parseArxivFeed('<feed xmlns="http://www.w3.org/2005/Atom"></feed>')).toEqual([]);
  });
});
