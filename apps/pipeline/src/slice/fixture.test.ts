import { readFileSync } from "node:fs";

import { parse } from "yaml";
import { describe, expect, it } from "vitest";

import { SLICE_ABSTRACT, SLICE_CANDIDATE, SLICE_TITLE, invertAbstract } from "./fixture.js";

const example = parse(
  readFileSync(
    new URL("../../../../docs/kt/examples/context-switching-opportunity.yaml", import.meta.url),
    "utf8",
  ),
) as {
  Publication: { Title: string; Abstract: string };
  Candidate: Record<string, unknown>;
};

describe("REQ-PROC-007: the slice fixture is the example publication", () => {
  it("REQ-PROC-007: AC3 the title, abstract, and candidate equal the example", () => {
    expect(SLICE_TITLE).toBe(example.Publication.Title);
    expect(SLICE_ABSTRACT).toBe(example.Publication.Abstract);
    const { Id: _id, ...candidate } = example.Candidate;
    expect(SLICE_CANDIDATE).toEqual(candidate);
  });

  it("REQ-PROC-007: AC1 the inverted abstract rebuilds the same text", () => {
    const index = invertAbstract(SLICE_ABSTRACT);
    const words: string[] = [];
    for (const [word, positions] of Object.entries(index)) {
      for (const position of positions) {
        words[position] = word;
      }
    }
    expect(words.join(" ")).toBe(SLICE_ABSTRACT);
  });
});
