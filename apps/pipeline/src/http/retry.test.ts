import { describe, expect, it, vi } from "vitest";

import { fetchWithBackoff, HttpRequestError, type FetchFn } from "./retry.js";

function response(status: number, headers: Record<string, string> = {}): Response {
  return new Response("body", { status, headers });
}

function setup(...responses: Array<Response | Error>) {
  const fetchFn = vi.fn<FetchFn>(() => {
    const next = responses.shift();
    if (next === undefined) {
      throw new Error("unexpected extra request");
    }
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  });
  const sleeps: number[] = [];
  const options = {
    MaxAttempts: 3,
    BaseMs: 100,
    Sleep: (ms: number) => {
      sleeps.push(ms);
      return Promise.resolve();
    },
  };
  return { fetchFn, sleeps, options };
}

describe("REQ-DATA-001: retry with exponential backoff", () => {
  it("REQ-DATA-001: retries a 429 and a 500, doubling the delay, then succeeds", async () => {
    const { fetchFn, sleeps, options } = setup(response(429), response(500), response(200));
    const result = await fetchWithBackoff(fetchFn, "https://example.org", undefined, options);
    expect(result.status).toBe(200);
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(sleeps).toEqual([100, 200]);
  });

  it("REQ-DATA-001: honors Retry-After over the computed delay", async () => {
    const { fetchFn, sleeps, options } = setup(
      response(429, { "retry-after": "7" }),
      response(200),
    );
    await fetchWithBackoff(fetchFn, "https://example.org", undefined, options);
    expect(sleeps).toEqual([7000]);
  });

  it("REQ-DATA-001: retries a network error", async () => {
    const { fetchFn, sleeps, options } = setup(new TypeError("fetch failed"), response(200));
    await fetchWithBackoff(fetchFn, "https://example.org", undefined, options);
    expect(sleeps).toEqual([100]);
  });

  it("REQ-DATA-001: gives up after the configured attempts and reports the last status", async () => {
    const { fetchFn, sleeps, options } = setup(response(503), response(503), response(503));
    const error = await fetchWithBackoff(fetchFn, "https://example.org", undefined, options).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(HttpRequestError);
    expect(error).toMatchObject({ Attempts: 3, Status: 503 });
    expect(sleeps).toEqual([100, 200]);
  });

  it("REQ-DATA-001: does not retry a client error such as 404", async () => {
    const { fetchFn, sleeps, options } = setup(response(404));
    await expect(
      fetchWithBackoff(fetchFn, "https://example.org", undefined, options),
    ).rejects.toMatchObject({ Attempts: 1, Status: 404 });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(sleeps).toEqual([]);
  });
});

describe("REQ-NFR-021: bounded requests and waits", () => {
  it("REQ-NFR-021: aborts a request that hangs and reports it after the last try", async () => {
    const fetchFn = vi.fn<FetchFn>(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );
    const sleeps: number[] = [];
    const error = await fetchWithBackoff(fetchFn, "https://example.org", undefined, {
      MaxAttempts: 2,
      BaseMs: 1,
      RequestTimeoutMs: 20,
      Sleep: (ms) => {
        sleeps.push(ms);
        return Promise.resolve();
      },
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(HttpRequestError);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(sleeps).toEqual([1]);
  });

  it("REQ-NFR-021: caps a long Retry-After at the configured maximum", async () => {
    const { fetchFn, sleeps, options } = setup(
      response(429, { "retry-after": "999999" }),
      response(200),
    );
    await fetchWithBackoff(fetchFn, "https://example.org", undefined, {
      ...options,
      MaxDelayMs: 5000,
    });
    expect(sleeps).toEqual([5000]);
  });

  it("REQ-NFR-021: retries a 408 like other transient statuses", async () => {
    const { fetchFn, options } = setup(response(408), response(200));
    const result = await fetchWithBackoff(fetchFn, "https://example.org", undefined, options);
    expect(result.status).toBe(200);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("REQ-NFR-021: a non-idempotent request is retried after a 429 but not after a 5xx", async () => {
    const limited = setup(response(429), response(201));
    const created = await fetchWithBackoff(fetchFn(limited), "https://example.org", undefined, {
      ...limited.options,
      RetryAmbiguous: false,
    });
    expect(created.status).toBe(201);

    const failing = setup(response(502), response(201));
    await expect(
      fetchWithBackoff(fetchFn(failing), "https://example.org", undefined, {
        ...failing.options,
        RetryAmbiguous: false,
      }),
    ).rejects.toMatchObject({ Attempts: 1, Status: 502 });
    expect(failing.fetchFn).toHaveBeenCalledTimes(1);

    const dropped = setup(new TypeError("fetch failed"), response(201));
    await expect(
      fetchWithBackoff(fetchFn(dropped), "https://example.org", undefined, {
        ...dropped.options,
        RetryAmbiguous: false,
      }),
    ).rejects.toMatchObject({ Attempts: 1, Status: null });
  });
});

function fetchFn(scenario: { fetchFn: FetchFn }): FetchFn {
  return scenario.fetchFn;
}
