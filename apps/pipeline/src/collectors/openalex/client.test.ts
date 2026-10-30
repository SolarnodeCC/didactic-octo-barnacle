import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildOpenAlexUrl, fetchOpenAlexPage } from "./client.js";
import { type FetchFn } from "../../http/retry.js";

const backoff = { MaxAttempts: 3, BaseMs: 1, Sleep: () => Promise.resolve() };

describe("REQ-DATA-001: OpenAlex client", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("REQ-TEST-003: unexpected network fetch"))),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("REQ-DATA-001: filters on the start date and starts at the first cursor", () => {
    const url = new URL(buildOpenAlexUrl({ FromDate: "2026-09-29", ApiKey: "k" }));
    expect(url.searchParams.get("filter")).toBe("from_publication_date:2026-09-29");
    expect(url.searchParams.get("cursor")).toBe("*");
    expect(url.searchParams.get("api_key")).toBe("k");
    expect(url.searchParams.get("mailto")).toBeNull();
  });

  it("REQ-DATA-001: falls back to a contact email when there is no key", () => {
    const url = new URL(buildOpenAlexUrl({ FromDate: "2026-09-29", Mailto: "ops@example.org" }));
    expect(url.searchParams.get("mailto")).toBe("ops@example.org");
    expect(url.searchParams.get("api_key")).toBeNull();
  });

  it("REQ-DATA-001: returns the works and the next cursor, null on the last page", async () => {
    const pages = [
      { results: [{ id: "https://openalex.org/W1" }], meta: { next_cursor: "abc" } },
      { results: [{ id: "https://openalex.org/W2" }], meta: { next_cursor: null } },
    ];
    const requested: string[] = [];
    const fetchFn: FetchFn = (input) => {
      requested.push(input);
      return Promise.resolve(Response.json(pages.shift()));
    };
    const deps = { Fetch: fetchFn, Backoff: backoff };

    const first = await fetchOpenAlexPage({ FromDate: "2026-09-29" }, deps);
    expect(first.NextCursor).toBe("abc");
    const second = await fetchOpenAlexPage({ FromDate: "2026-09-29", Cursor: "abc" }, deps);
    expect(second.NextCursor).toBeNull();
    expect(new URL(requested[1] as string).searchParams.get("cursor")).toBe("abc");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("REQ-DATA-001: retries a rate-limited page and then succeeds", async () => {
    const responses = [
      new Response("", { status: 429 }),
      Response.json({ results: [], meta: { next_cursor: null } }),
    ];
    const fetchFn: FetchFn = () => Promise.resolve(responses.shift() as Response);
    const page = await fetchOpenAlexPage(
      { FromDate: "2026-09-29" },
      { Fetch: fetchFn, Backoff: backoff },
    );
    expect(page.Works).toEqual([]);
  });
});
