import { describe, expect, it } from "vitest";

import { decideMerge } from "./dedupe-merge.js";

describe("REQ-DATA-007: cross-source merge decisions", () => {
  it("REQ-DATA-007: merges OpenAlex and arXiv records that share a DOI", () => {
    const decision = decideMerge({
      Incoming: { Doi: "https://doi.org/10.1000/Shared", ArxivId: "2409.22222" },
      Existing: { Doi: "10.1000/shared", OpenAlexIds: ["w1001"] },
      IncomingTitle: "A",
      IncomingFirstAuthor: "Ada",
      ExistingTitle: "B",
      ExistingFirstAuthor: "Grace",
    });
    expect(decision).toEqual({
      Action: "merge",
      Match: { Kind: "doi", Value: "10.1000/shared" },
    });
  });

  it("REQ-DATA-007: flags title-and-first-author matches for review", () => {
    const decision = decideMerge({
      Incoming: { ArxivId: "2409.1" },
      Existing: { OpenAlexIds: ["w1"] },
      IncomingTitle: "Same Title!",
      IncomingFirstAuthor: "Ada Lovelace",
      ExistingTitle: "same title",
      ExistingFirstAuthor: "Ada Lovelace",
    });
    expect(decision.Action).toBe("review");
  });

  it("REQ-NFR-016: a missing first author is no evidence, so equal titles are not flagged", () => {
    const base = {
      Incoming: { ArxivId: "2409.1" },
      Existing: { OpenAlexIds: ["w1"] },
      IncomingTitle: "Same Title",
      ExistingTitle: "Same Title",
    };
    expect(
      decideMerge({ ...base, IncomingFirstAuthor: "", ExistingFirstAuthor: "Ada Lovelace" }).Action,
    ).toBe("create");
    expect(decideMerge({ ...base, IncomingFirstAuthor: "", ExistingFirstAuthor: "" }).Action).toBe(
      "create",
    );
  });
});
