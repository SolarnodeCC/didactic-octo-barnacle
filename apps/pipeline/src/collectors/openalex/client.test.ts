import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildOpenAlexUrl, fetchOpenAlexPage, OPENALEX_WORK_FIELDS } from "./client.js";
import { type OpenAlexWork } from "./types.js";
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
    expect(url.searchParams.get("filter")).toBe("from_publication_date:2026-09-29,language:en");
    expect(url.searchParams.get("cursor")).toBe("*");
    expect(url.searchParams.get("per-page")).toBe("100");
    expect(url.searchParams.get("api_key")).toBeNull();
  });

  it("REQ-DATA-009: ends the window on the day of the run when it is given one", () => {
    const url = new URL(buildOpenAlexUrl({ FromDate: "2026-09-29", ToDate: "2026-10-30" }));
    expect(url.searchParams.get("filter")).toBe(
      "from_publication_date:2026-09-29,to_publication_date:2026-10-30,language:en",
    );
  });

  it("REQ-NFR-010: asks only for the fields the mapper reads", () => {
    // Every field of the work type, checked by the compiler: a new field must be listed.
    const fields: Record<keyof OpenAlexWork, true> = {
      id: true,
      title: true,
      display_name: true,
      type: true,
      publication_date: true,
      doi: true,
      ids: true,
      abstract_inverted_index: true,
      authorships: true,
      topics: true,
      primary_topic: true,
      cited_by_count: true,
      language: true,
      is_retracted: true,
      open_access: true,
      primary_location: true,
    };
    const url = new URL(buildOpenAlexUrl({ FromDate: "2026-09-29" }));
    const selected = (url.searchParams.get("select") ?? "").split(/,/u);
    expect(selected.sort()).toEqual(Object.keys(fields).sort());
    expect([...OPENALEX_WORK_FIELDS].sort()).toEqual(Object.keys(fields).sort());
  });

  it("REQ-DATA-001: filters on the configured work types and on having an abstract", () => {
    const url = new URL(
      buildOpenAlexUrl({
        FromDate: "2026-09-29",
        WorkTypes: ["article", " preprint ", ""],
        RequireAbstract: true,
      }),
    );
    expect(url.searchParams.get("filter")).toBe(
      "from_publication_date:2026-09-29,language:en,type:article|preprint,has_abstract:true",
    );
  });

  it("REQ-DATA-001: filters on the configured subfield IDs when there are any", () => {
    const url = new URL(
      buildOpenAlexUrl({ FromDate: "2026-09-29", SubfieldIds: ["1710", " 1709 ", ""] }),
    );
    expect(url.searchParams.get("filter")).toBe(
      "from_publication_date:2026-09-29,language:en,primary_topic.subfield.id:1710|1709",
    );
  });

  it("REQ-DATA-009: sorts by publication date so a saved cursor stays stable between runs", () => {
    const url = new URL(buildOpenAlexUrl({ FromDate: "2026-09-29" }));
    expect(url.searchParams.get("sort")).toBe("publication_date:desc");
  });

  it("REQ-DATA-001: sends the API key as a bearer token, not in the URL", async () => {
    const headersSeen: Array<Record<string, string>> = [];
    const fetchFn: FetchFn = (_input, init) => {
      headersSeen.push((init?.headers ?? {}) as Record<string, string>);
      return Promise.resolve(Response.json({ results: [], meta: { next_cursor: null } }));
    };
    await fetchOpenAlexPage(
      { FromDate: "2026-09-29", ApiKey: "secret-key" },
      { Fetch: fetchFn, Backoff: backoff },
    );
    expect(headersSeen[0]).toEqual({
      accept: "application/json",
      authorization: "Bearer secret-key",
    });
  });

  it("REQ-NFR-021: refuses a response larger than the configured cap", async () => {
    const fetchFn: FetchFn = () =>
      Promise.resolve(Response.json({ results: [], meta: { next_cursor: "x".repeat(200) } }));
    await expect(
      fetchOpenAlexPage(
        { FromDate: "2026-09-29" },
        { Fetch: fetchFn, Backoff: backoff, MaxResponseBytes: 100 },
      ),
    ).rejects.toThrow(/larger than 100 bytes/u);
  });

  it("REQ-DATA-001: omits Authorization when there is no key", async () => {
    const headersSeen: Array<Record<string, string>> = [];
    const fetchFn: FetchFn = (_input, init) => {
      headersSeen.push((init?.headers ?? {}) as Record<string, string>);
      return Promise.resolve(Response.json({ results: [], meta: { next_cursor: null } }));
    };
    await fetchOpenAlexPage({ FromDate: "2026-09-29" }, { Fetch: fetchFn, Backoff: backoff });
    expect(headersSeen[0]).toEqual({ accept: "application/json" });
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

describe("REQ-DATA-001: OpenAlex client on a recorded empty page", () => {
  it("REQ-DATA-001: an empty page has no works and no next cursor, so paging stops", async () => {
    const body = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../../fixtures/openalex/page-empty.json"),
      "utf8",
    );
    const fetchFn: FetchFn = () => Promise.resolve(new Response(body));

    const page = await fetchOpenAlexPage(
      { FromDate: "2026-10-01" },
      { Fetch: fetchFn, Backoff: backoff },
    );

    expect(page).toEqual({ Works: [], NextCursor: null });
  });
});
