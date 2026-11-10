import { parseGeneration, ProviderCallError } from "@roi/models";
import { describe, expect, it } from "vitest";

import { assembleEventStream, GatewayRestBinding, putR2Object } from "./gateway-binding.js";

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

function sse(events: unknown[]): string {
  return [...events.map((e) => `data: ${JSON.stringify(e)}`), "data: [DONE]", ""].join("\n\n");
}

describe("REQ-NFR-003: streamed calls through AI Gateway", () => {
  it("REQ-NFR-003: AC1 a streamed call uses the per-model route, names the gateway, and rebuilds the reply", async () => {
    const calls: Captured[] = [];
    const fetchStub = (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      calls.push({ Url: String(url), Init: init ?? {} });
      return Promise.resolve(
        new Response(
          sse([
            { choices: [{ delta: { reasoning_content: "Think. " }, finish_reason: null }] },
            { choices: [{ delta: { content: '{"Ans' }, finish_reason: null }] },
            {
              choices: [{ delta: { content: 'wer": true}' }, finish_reason: "stop" }],
              usage: { prompt_tokens: 0, completion_tokens: 1, total_tokens: 1 },
            },
            {
              response: "",
              usage: { prompt_tokens: 25, completion_tokens: 207, total_tokens: 232 },
            },
          ]),
          {
            status: 200,
            headers: { "content-type": "text/event-stream", "cf-aig-log-id": "log_s" },
          },
        ),
      );
    };
    const ai = new GatewayRestBinding({
      AccountId: ACCOUNT,
      ApiToken: "token-value",
      MinIntervalMs: 0,
      TimeoutMs: 1000,
      Stream: true,
      Fetch: fetchStub as typeof fetch,
    });
    const result = await ai.run(
      "@cf/google/gemma-4-26b-a4b-it",
      { messages: [], max_tokens: 10 },
      { gateway: { id: "roi-staging" } },
    );
    expect(calls[0]?.Url).toBe(
      `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/ai/run/@cf/google/gemma-4-26b-a4b-it`,
    );
    expect(JSON.parse(String(calls[0]?.Init.body))).toEqual({
      messages: [],
      max_tokens: 10,
      stream: true,
    });
    const headers = calls[0]?.Init.headers as Record<string, string>;
    expect(headers["cf-aig-gateway-id"]).toBe("roi-staging");
    expect(ai.aiGatewayLogId).toBe("log_s");
    expect(parseGeneration(result)).toEqual({
      Output: '{"Answer": true}',
      InputTokens: 25,
      OutputTokens: 207,
      CachedInputTokens: 0,
    });
  });

  it("REQ-NFR-011: the rebuilt stream keeps the cached input tokens of the usage (ADR 0078)", () => {
    const result = assembleEventStream(
      sse([
        { choices: [{ delta: { content: "{}" }, finish_reason: null }] },
        {
          choices: [{ delta: {}, finish_reason: "stop" }],
          usage: {
            prompt_tokens: 1027,
            completion_tokens: 2443,
            total_tokens: 3470,
            prompt_tokens_details: { cached_tokens: 960 },
          },
        },
      ]),
    );
    expect(result.usage).toMatchObject({ prompt_tokens_details: { cached_tokens: 960 } });
    expect(parseGeneration(result)).toEqual({
      Output: "{}",
      InputTokens: 1027,
      OutputTokens: 2443,
      CachedInputTokens: 960,
    });

    // A final total without details keeps the details of an earlier usage event.
    const later = assembleEventStream(
      sse([
        {
          response: "{}",
          usage: {
            prompt_tokens: 1027,
            completion_tokens: 1,
            prompt_tokens_details: { cached_tokens: 960 },
          },
        },
        { response: "", usage: { prompt_tokens: 1027, completion_tokens: 2443 } },
      ]),
    );
    expect(parseGeneration(later)).toMatchObject({ OutputTokens: 2443, CachedInputTokens: 960 });
  });

  it("REQ-NFR-011: a stream that ends in reasoning only gives empty content and the real token count", () => {
    const result = assembleEventStream(
      sse([
        { choices: [{ delta: { reasoning: "long thought" }, finish_reason: "length" }] },
        { usage: { prompt_tokens: 900, completion_tokens: 1024 } },
      ]),
    );
    expect(result).toMatchObject({
      choices: [{ message: { content: "", reasoning: "long thought" }, finish_reason: "length" }],
    });
    expect(parseGeneration(result)).toMatchObject({ Output: "", OutputTokens: 1024 });
  });

  it("REQ-NFR-003: a stream of response pieces keeps the response shape", () => {
    const result = assembleEventStream(
      sse([
        { response: '{"a":' },
        { response: "1}", usage: { prompt_tokens: 3, completion_tokens: 2 } },
      ]),
    );
    expect(parseGeneration(result)).toEqual({
      Output: '{"a":1}',
      InputTokens: 3,
      OutputTokens: 2,
      CachedInputTokens: 0,
    });
  });

  it("REQ-AGENT-012: an error event in the stream is a retryable provider error", () => {
    let error: unknown;
    try {
      assembleEventStream(sse([{ errors: [{ code: 3040, message: "Capacity exceeded" }] }]));
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(ProviderCallError);
    expect(error).toMatchObject({ Status: 502, message: "Capacity exceeded" });
  });

  it("REQ-AGENT-012: a streamed call that fails before the stream keeps its HTTP status", async () => {
    const { Fetch } = stubFetch([
      {
        Status: 429,
        Body: {
          success: false,
          errors: [{ code: 3040, message: "Capacity temporarily exceeded" }],
        },
        Headers: { "retry-after": "5" },
      },
    ]);
    const ai = new GatewayRestBinding({
      AccountId: ACCOUNT,
      ApiToken: "token-value",
      MinIntervalMs: 0,
      TimeoutMs: 1000,
      Stream: true,
      Fetch,
    });
    const error = await ai
      .run("@cf/zai-org/glm-4.7-flash", {}, { gateway: { id: "roi-staging" } })
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ Status: 429, RetryAfterSeconds: 5 });
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
