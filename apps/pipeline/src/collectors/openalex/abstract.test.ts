import { describe, expect, it } from "vitest";

import { reconstructAbstract } from "./abstract.js";

describe("REQ-DATA-001: OpenAlex abstract reconstruction", () => {
  it("REQ-DATA-001: rebuilds text from abstract_inverted_index", () => {
    expect(
      reconstructAbstract({
        Hello: [0],
        world: [1],
        from: [2],
        OpenAlex: [3],
      }),
    ).toBe("Hello world from OpenAlex");
  });

  it("REQ-DATA-001: returns null when the inverted index is missing", () => {
    expect(reconstructAbstract(null)).toBeNull();
    expect(reconstructAbstract({})).toBeNull();
  });
});
