import { ProviderCallError } from "@roi/models";
import { describe, expect, it } from "vitest";

import { GatewayRestBinding, putR2Object } from "./gateway-binding.js";

const ACCOUNT = "0123456789abcdef0123456789abcdef";

type Captured = { Url: string; Init: RequestInit };

function stubFetch(
  responses: Array<{ Status: number; Body: unknown; Headers?: Record<string, string> }>,
): { Fetch: typeof fetch; Calls: Captured[] } {
  const calls: Captured[] = [];
  const fetchStub = (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    calls.push({ Url: String(url), Init: init ?? {} });
    const next = responses.shift();
    if (!next) {
      return Promise.reject(new Error("no response left"));
    }
    return Promise.resolve(
      new Response(JSON.stringify(next.Body), {
        status: next.Status,
        headers: next.Headers ?? {},
      }),
    );
  };
  return { Fetch: fetchStub as typeof fetch, Calls: calls };
}

function binding(fetchFn: typeof fetch, sleeps: number[] = [], clock = { t: 0 }) {
  return new GatewayRestBinding({
    AccountId: ACCOUNT,
    ApiToken: "token-value",
    MinIntervalMs: 3000,
    TimeoutMs: 1000,
    Fetch: fetchFn,
    Sleep: (ms) => {
      sleeps.push(ms);
      clock.t += ms;
      return Promise.resolve();
    },
    Now: () => clock.t,
  });
}

describe("REQ-NFR-003: the benchmark calls Workers AI through AI Gateway", () => {
  it("REQ-NFR-003: AC1 every call names the gateway, skips the cache, and carries the metadata", async () => {
    const { Fetch, Calls } = stubFetch([
      {
        Status: 200,
        Body: { success: true, result: { response: "{}", usage: { prompt_tokens: 3 } } },
        Headers: { "cf-aig-log-id": "log_9" },
      },
    ]);
    const ai = binding(Fetch);
    const result = await ai.run(
      "@cf/google/gemma-4-26b-a4b-it",
      { messages: [] },
      { gateway: { id: "roi-staging", metadata: { RunId: "r1", Step: "triage" } } },
    );
    expect(result).toEqual({ response: "{}", usage: { prompt_tokens: 3 } });
    expect(ai.aiGatewayLogId).toBe("log_9");
    expect(Calls[0]?.Url).toBe(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/ai/run`);
    const headers = Calls[0]?.Init.headers as Record<string, string>;
    expect(headers["cf-aig-gateway-id"]).toBe("roi-staging");
    expect(headers["cf-aig-skip-cache"]).toBe("true");
    expect(JSON.parse(headers["cf-aig-metadata"] ?? "{}")).toEqual({ RunId: "r1", Step: "triage" });
    expect(JSON.parse(String(Calls[0]?.Init.body))).toEqual({
      model: "@cf/google/gemma-4-26b-a4b-it",
      input: { messages: [] },
    });
  });

  it("REQ-NFR-003: a malformed account ID or token is refused before any request", () => {
    const { Fetch } = stubFetch([]);
    expect(
      () =>
        new GatewayRestBinding({
          AccountId: "abc",
          ApiToken: "t",
          MinIntervalMs: 0,
          TimeoutMs: 1,
          Fetch,
        }),
    ).toThrow(/CLOUDFLARE_ACCOUNT_ID/);
    expect(
      () =>
        new GatewayRestBinding({
          AccountId: ACCOUNT,
          ApiToken: "two words",
          MinIntervalMs: 0,
          TimeoutMs: 1,
          Fetch,
        }),
    ).toThrow(/CLOUDFLARE_API_TOKEN/);
  });
});

describe("REQ-AGENT-012: rate limits in the benchmark", () => {
  it("REQ-AGENT-012: AC3 a 429 becomes a provider error with its Retry-After", async () => {
    const { Fetch } = stubFetch([
      {
        Status: 429,
        Body: {
          success: false,
          errors: [{ code: 3040, message: "Capacity temporarily exceeded" }],
        },
        Headers: { "retry-after": "12" },
      },
    ]);
    const error = await binding(Fetch)
      .run("@cf/zai-org/glm-5.3", {}, { gateway: { id: "roi-staging" } })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProviderCallError);
    expect(error).toMatchObject({ Status: 429, RetryAfterSeconds: 12 });
    expect((error as Error).message).toBe("Capacity temporarily exceeded");
  });

  it("REQ-AGENT-012: calls are spaced by the minimum interval, 20 per minute by default", async () => {
    const ok = { Status: 200, Body: { success: true, result: {} } };
    const { Fetch } = stubFetch([ok, ok, ok]);
    const sleeps: number[] = [];
    const ai = binding(Fetch, sleeps);
    for (let i = 0; i < 3; i += 1) {
      await ai.run("@cf/zai-org/glm-5.3", {}, { gateway: { id: "roi-staging" } });
    }
    expect(sleeps).toEqual([3000, 3000]);
  });

  it("REQ-AGENT-012: a 410 for a deprecated model keeps its status, so it is not retried", async () => {
    const { Fetch } = stubFetch([
      { Status: 410, Body: { success: false, errors: [{ code: 5028, message: "Gone" }] } },
    ]);
    const error = await binding(Fetch)
      .run("@cf/zai-org/glm-5.3-flash", {}, { gateway: { id: "roi-staging" } })
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ Status: 410 });
  });
});

describe("REQ-NFR-011: raw responses are kept in R2", () => {
  it("REQ-NFR-011: putR2Object stores one object under its key", async () => {
    const { Fetch, Calls } = stubFetch([{ Status: 200, Body: { success: true } }]);
    await putR2Object({
      AccountId: ACCOUNT,
      ApiToken: "token-value",
      Bucket: "roi-documents-staging",
      Key: "benchmark/bench-1/raw-responses.jsonl",
      Body: "{}",
      Fetch,
    });
    expect(Calls[0]?.Url).toBe(
      `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/r2/buckets/roi-documents-staging/objects/benchmark/bench-1/raw-responses.jsonl`,
    );
    expect(Calls[0]?.Init.method).toBe("PUT");
  });
});
