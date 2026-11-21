import { describe, expect, it } from "vitest";

import { ruleReason } from "./rules.js";

const IN_SCOPE = { Completeness: "complete", Retracted: false };

describe("REQ-PROC-006: triage scope and completeness rules", () => {
  it("REQ-PROC-006: AC1 a topic or category of the topic map is in scope", () => {
    expect(ruleReason({ ...IN_SCOPE, Topics: ["q-fin.RM"] })).toBeNull();
    expect(ruleReason({ ...IN_SCOPE, Topics: ["Health Informatics"] })).toBeNull();
  });

  it("REQ-PROC-006: AC1 a cross-industry category is in scope; Relevance assigns the industry later", () => {
    expect(ruleReason({ ...IN_SCOPE, Topics: ["cs.AI"] })).toBeNull();
    expect(ruleReason({ ...IN_SCOPE, Topics: ["cs.SE", "math.OC"] })).toBeNull();
  });

  it("REQ-PROC-006: AC1 a publication with no topic of the map is out of scope", () => {
    expect(ruleReason({ ...IN_SCOPE, Topics: ["astro-ph.GA"] })).toBe("out-of-scope");
    expect(ruleReason({ ...IN_SCOPE, Topics: [] })).toBe("out-of-scope");
  });

  it("REQ-PROC-005: AC1 retracted and incomplete publications are rejected before scope", () => {
    expect(ruleReason({ Completeness: "complete", Retracted: true, Topics: ["cs.AI"] })).toBe(
      "retracted",
    );
    expect(ruleReason({ Completeness: "incomplete", Retracted: false, Topics: ["cs.AI"] })).toBe(
      "incomplete",
    );
  });
});
