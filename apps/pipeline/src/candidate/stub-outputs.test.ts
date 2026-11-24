import { readFileSync } from "node:fs";

import { parse } from "yaml";
import { describe, expect, it } from "vitest";

import { STUB_OUTPUTS } from "./stub-outputs.js";

describe("REQ-PROC-007: the stub outputs are the examples", () => {
  it("REQ-PROC-007: AC3 the stub outputs equal the agent sections of the example", () => {
    const example = parse(
      readFileSync(
        new URL("../../../../docs/kt/examples/context-switching-opportunity.yaml", import.meta.url),
        "utf8",
      ),
    ) as { Agents: unknown };
    expect(STUB_OUTPUTS).toEqual(example.Agents);
  });
});
