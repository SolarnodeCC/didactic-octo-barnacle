import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";

import {
  JUDGE_MODEL,
  createClaudeJudge,
  judgeAgreement,
  judgeCostEur,
  judgeGatewayBaseUrl,
  judgeUserText,
  loadRubric,
  type JudgeCallRecord,
} from "./judge.js";

const output = {
  Problem: "Governments cannot tell which crops a storm will damage.",
  Customer: {
    Segment: "regional governments",
    Role: "disaster officer",
    Industry: "public-sector" as const,
  },
  PainLevel: 4,
  PainRationale: "Losses are large and decisions are urgent.",
  Confidence: 0.6,
  Notes: null,
};
const facts = ["forecasts do not say which crops suffer", "governments need to respond quickly"];

type Reply = {
  stop_reason: string;
  parsed_output: { Verdicts: Array<{ Fact: number; Present: boolean; Reason: string }> } | null;
  usage: { input_tokens: number; output_tokens: number };
};

/** A client whose `messages.parse` returns scripted replies; no network (REQ-TEST-002 AC2). */
function fakeClient(replies: Array<Reply | Error>): {
  client: Pick<Anthropic, "messages">;
  requests: unknown[];
} {
  const requests: unknown[] = [];
  const parse = (body: unknown) => {
    requests.push(body);
    const next = replies.shift();
    return {
      withResponse: () =>
        next instanceof Error
          ? Promise.reject(next)
          : Promise.resolve({
              data: next,
              response: { headers: new Headers({ "cf-aig-log-id": "log_1" }) },
            }),
    };
  };
  return { client: { messages: { parse } } as unknown as Pick<Anthropic, "messages">, requests };
}

function judgeWith(replies: Array<Reply | Error>, allows = true) {
  const records: JudgeCallRecord[] = [];
  let spent = 0;
  const { client, requests } = fakeClient(replies);
  const judge = createClaudeJudge({
    Client: client,
    Rubric: loadRubric(),
    RunId: "bench-1:problem-discovery:m:r1",
    UsdPerEur: 1.1193,
    Budget: { allows: () => allows, add: (eur) => (spent += eur) },
    NewId: () => "jc_1",
    Now: () => new Date("2026-11-11T12:00:00Z"),
    OnRecord: (r) => records.push(r),
  });
  return { judge, records, requests, spent: () => spent };
}

const reply = (present: boolean[], stop = "end_turn"): Reply => ({
  stop_reason: stop,
  parsed_output: { Verdicts: present.map((p, i) => ({ Fact: i + 1, Present: p, Reason: "r" })) },
  usage: { input_tokens: 1000, output_tokens: 200 },
});

describe("REQ-TEST-005: the Problem Discovery fact judge", () => {
  it("REQ-TEST-005: the rubric is versioned next to the golden set and asks for one verdict per fact", () => {
    const rubric = loadRubric();
    expect(rubric.Version).toBe("pd-facts@1");
    expect(rubric.Text).toContain("one verdict per fact");
    expect(rubric.Text).not.toContain("## Calibration");
  });

  it("REQ-TEST-005: verdicts in order become the facts present, and the call is costed and recorded", async () => {
    const { judge, records, requests, spent } = judgeWith([reply([true, false])]);
    expect(
      await judge({ EntryId: "gs-problem-discovery-001", Facts: facts, Output: output }),
    ).toEqual({
      Ok: true,
      Present: [true, false],
    });
    expect(requests[0]).toMatchObject({ model: JUDGE_MODEL, output_config: { effort: "medium" } });
    expect(records[0]).toMatchObject({
      Outcome: "ok",
      GatewayLogId: "log_1",
      RubricVersion: "pd-facts@1",
    });
    expect(spent()).toBeCloseTo(judgeCostEur(1000, 200, 1.1193), 12);
  });

  it("REQ-TEST-005: a refusal, a wrong number of verdicts, a cut-off answer, and a provider error are errors, not verdicts", async () => {
    const cases: Array<Reply | Error> = [
      reply([true, true], "refusal"),
      reply([true]),
      reply([true, true], "max_tokens"),
      new Error("connection reset"),
    ];
    const { judge, records } = judgeWith(cases);
    for (let i = 0; i < 4; i += 1) {
      expect((await judge({ EntryId: "e", Facts: facts, Output: output })).Ok).toBe(false);
    }
    expect(records.map((r) => r.Outcome)).toEqual([
      "refusal",
      "invalid-output",
      "invalid-output",
      "provider-error",
    ]);
  });

  it("REQ-NFR-005: no judge call starts once the round's budget is spent", async () => {
    const { judge, requests } = judgeWith([reply([true, true])], false);
    expect(await judge({ EntryId: "e", Facts: facts, Output: output })).toEqual({
      Ok: false,
      Error: "budget-exhausted",
    });
    expect(requests).toHaveLength(0);
  });

  it("REQ-NFR-003: the judge is reached through the Anthropic route of AI Gateway", () => {
    expect(judgeGatewayBaseUrl("acct", "roi-staging")).toBe(
      "https://gateway.ai.cloudflare.com/v1/acct/roi-staging/anthropic",
    );
  });

  it("REQ-TEST-005: the judge reads the facts and the output, numbered, and nothing else", () => {
    const text = judgeUserText(facts, output);
    expect(text).toContain("1. forecasts do not say which crops suffer");
    expect(text).toContain("PainRationale: Losses are large");
    expect(text).not.toContain("Confidence");
  });

  it("REQ-TEST-005: agreement with the owner is counted over every fact", () => {
    expect(judgeAgreement([[true, false], [true]], [[true, true], [true]])).toEqual({
      Agreed: 2,
      Facts: 3,
      Share: 2 / 3,
    });
    expect(() => judgeAgreement([[true]], [[true, false]])).toThrow(/different number/);
  });
});
