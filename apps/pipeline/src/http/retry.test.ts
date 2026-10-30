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
