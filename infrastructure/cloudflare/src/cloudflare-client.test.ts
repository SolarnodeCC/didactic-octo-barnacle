import { describe, expect, it } from "vitest";

import { bootstrapEnvironment, desiredResources } from "./bootstrap.js";
import {
  CloudflareApiError,
  CloudflareConfigError,
  VECTORIZE_DIMENSIONS,
  VECTORIZE_METRIC,
  createCloudflareClient,
} from "./cloudflare-client.js";

const ACCOUNT = "0123456789abcdef0123456789abcdef";
const TOKEN = "secret-token-value";

type Call = { method: string; path: string; auth: string | null; body: unknown };

/** A Cloudflare account in memory that answers the endpoints the client uses. */
function fakeAccount(seed: { d1?: string[]; queues?: string[]; other?: string[] } = {}) {
  const store = {
    d1: [...(seed.d1 ?? []), ...(seed.other ?? [])],
    r2: [...(seed.other ?? [])],
    queues: [...(seed.queues ?? [])],
    vectorize: [] as string[],
    gateways: [] as string[],
  };
  const calls: Call[] = [];

  const ok = (result: unknown) => Response.json({ success: true, errors: [], result });

  const fetchFn: typeof fetch = (input, init) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(`/client/v4/accounts/${ACCOUNT}`, "");
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const headers = new Headers(init?.headers);
    calls.push({ method, path, auth: headers.get("authorization"), body });

    if (method === "GET") {
      const page = Number(url.searchParams.get("page") ?? 1);
      const perPage = Number(url.searchParams.get("per_page") ?? 100);
      const slice = <T>(items: T[]) => items.slice((page - 1) * perPage, page * perPage);
      if (path === "/d1/database")
        return Promise.resolve(ok(slice(store.d1).map((name) => ({ name }))));
      if (path === "/r2/buckets")
        return Promise.resolve(ok({ buckets: slice(store.r2).map((name) => ({ name })) }));
      if (path === "/queues")
        return Promise.resolve(ok(slice(store.queues).map((queue_name) => ({ queue_name }))));
      if (path === "/vectorize/v2/indexes")
        return Promise.resolve(ok(slice(store.vectorize).map((name) => ({ name }))));
      if (path === "/ai-gateway/gateways")
        return Promise.resolve(ok(slice(store.gateways).map((id) => ({ id }))));
    } else {
      const name = body?.name ?? body?.queue_name ?? body?.id;
      if (path === "/d1/database") store.d1.push(name);
      else if (path === "/r2/buckets") store.r2.push(name);
      else if (path === "/queues") store.queues.push(name);
      else if (path === "/vectorize/v2/indexes") store.vectorize.push(name);
      else if (path === "/ai-gateway/gateways") store.gateways.push(name);
      else
        return Promise.resolve(
          Response.json({ success: false, errors: [{ message: "no route" }] }, { status: 404 }),
        );
      return Promise.resolve(ok({}));
    }
    return Promise.resolve(
      Response.json({ success: false, errors: [{ message: "no route" }] }, { status: 404 }),
    );
  };

  return { fetchFn, calls, store };
}

describe("REQ-NFR-020: Cloudflare bootstrap client", () => {
  it("REQ-NFR-020: apply creates every missing staging resource, a second run creates nothing", async () => {
    const account = fakeAccount();
    const client = createCloudflareClient({
      AccountId: ACCOUNT,
      ApiToken: TOKEN,
      Fetch: account.fetchFn,
    });

    const first = await bootstrapEnvironment({
      Environment: "staging",
      Mode: "apply",
      Client: client,
    });
    expect(first.Created).toHaveLength(desiredResources("staging").length);
    expect(first.Drift.Missing).toEqual([]);

    const second = await bootstrapEnvironment({
      Environment: "staging",
      Mode: "apply",
      Client: client,
    });
    expect(second.Created).toEqual([]);
    expect(second.Drift.Missing).toEqual([]);
    expect(second.Drift.Extra).toEqual([]);
  });

  it("REQ-NFR-020: skips resources that already exist, such as the staging D1 database", async () => {
    const account = fakeAccount({ d1: ["roi-staging"] });
    const client = createCloudflareClient({
      AccountId: ACCOUNT,
      ApiToken: TOKEN,
      Fetch: account.fetchFn,
    });

    const result = await bootstrapEnvironment({
      Environment: "staging",
      Mode: "apply",
      Client: client,
    });
    expect(result.Created.map((r) => r.Kind)).not.toContain("d1");
    expect(account.calls.filter((c) => c.method === "POST" && c.path === "/d1/database")).toEqual(
      [],
    );
  });

  it("REQ-NFR-020: plan mode only reads and reports drift", async () => {
    const account = fakeAccount();
    const client = createCloudflareClient({
      AccountId: ACCOUNT,
      ApiToken: TOKEN,
      Fetch: account.fetchFn,
    });

    const result = await bootstrapEnvironment({
      Environment: "staging",
      Mode: "plan",
      Client: client,
    });
    expect(result.Drift.Missing).toHaveLength(desiredResources("staging").length);
    expect(account.calls.every((c) => c.method === "GET")).toBe(true);
  });

  it("REQ-NFR-020: creates the dead-letter queue as its own queue and a Vectorize index with fixed settings", async () => {
    const account = fakeAccount();
    const client = createCloudflareClient({
      AccountId: ACCOUNT,
      ApiToken: TOKEN,
      Fetch: account.fetchFn,
    });
    await bootstrapEnvironment({ Environment: "staging", Mode: "apply", Client: client });

    expect(account.store.queues.sort()).toEqual([
      "roi-publications-dlq-staging",
      "roi-publications-staging",
    ]);
    const vectorize = account.calls.find(
      (c) => c.method === "POST" && c.path === "/vectorize/v2/indexes",
    );
    expect(vectorize?.body).toEqual({
      name: "roi-publications-staging",
      config: { dimensions: VECTORIZE_DIMENSIONS, metric: VECTORIZE_METRIC },
    });
    expect([VECTORIZE_DIMENSIONS, VECTORIZE_METRIC]).toEqual([768, "cosine"]);
  });

  it("REQ-NFR-020: ignores resources of other projects and of other environments", async () => {
    const account = fakeAccount({
      other: ["taakhelden-db", "qesto-staging"],
      d1: ["roi-production"],
    });
    const client = createCloudflareClient({
      AccountId: ACCOUNT,
      ApiToken: TOKEN,
      Fetch: account.fetchFn,
    });

    const found = await client.list();
    expect(found.map((r) => r.Name).sort()).toEqual(["roi-production"]);
    const result = await bootstrapEnvironment({
      Environment: "staging",
      Mode: "plan",
      Client: client,
    });
    expect(result.Drift.Extra).toEqual([]);
  });

  it("REQ-NFR-020: reads every page of a list", async () => {
    const names = Array.from({ length: 130 }, (_, i) => `roi-extra-${i}`);
    const account = fakeAccount({ d1: names });
    const client = createCloudflareClient({
      AccountId: ACCOUNT,
      ApiToken: TOKEN,
      Fetch: account.fetchFn,
    });

    const found = await client.list();
    expect(found.filter((r) => r.Kind === "d1")).toHaveLength(130);
  });

  it("REQ-NFR-020: sends the token only as a bearer header and keeps it out of errors", async () => {
    const account = fakeAccount();
    const client = createCloudflareClient({
      AccountId: ACCOUNT,
      ApiToken: TOKEN,
      Fetch: account.fetchFn,
    });
    await client.list();
    expect(account.calls.every((c) => c.auth === `Bearer ${TOKEN}`)).toBe(true);

    const failing: typeof fetch = () =>
      Promise.resolve(
        Response.json({ success: false, errors: [{ message: "forbidden" }] }, { status: 403 }),
      );
    const broken = createCloudflareClient({ AccountId: ACCOUNT, ApiToken: TOKEN, Fetch: failing });
    const error = await broken.list().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CloudflareApiError);
    expect((error as Error).message).toContain("HTTP 403: forbidden");
    expect((error as Error).message).not.toContain(TOKEN);
  });

  it("REQ-NFR-020: fails loudly when the API answers success: false with HTTP 200", async () => {
    const failing: typeof fetch = () =>
      Promise.resolve(Response.json({ success: false, errors: [{ message: "bad" }] }));
    const client = createCloudflareClient({ AccountId: ACCOUNT, ApiToken: TOKEN, Fetch: failing });
    await expect(client.create({ Kind: "d1", Name: "roi-staging" })).rejects.toThrow(/bad/);
  });

  it("REQ-NFR-020: rejects a malformed account ID before any request and never prints it", () => {
    const account = fakeAccount();
    const bad = `"${ACCOUNT}"`;
    expect(() =>
      createCloudflareClient({ AccountId: bad, ApiToken: TOKEN, Fetch: account.fetchFn }),
    ).toThrow(CloudflareConfigError);
    try {
      createCloudflareClient({ AccountId: bad, ApiToken: TOKEN, Fetch: account.fetchFn });
    } catch (error) {
      expect((error as Error).message).toContain("got 34 characters");
      expect((error as Error).message).not.toContain(ACCOUNT);
    }
    expect(account.calls).toEqual([]);
  });

  it("REQ-NFR-020: trims whitespace around the account ID and token, as pasted secrets often have", async () => {
    const account = fakeAccount();
    const client = createCloudflareClient({
      AccountId: `${ACCOUNT}\n`,
      ApiToken: ` ${TOKEN}\n`,
      Fetch: account.fetchFn,
    });
    await client.list();
    expect(account.calls[0]?.auth).toBe(`Bearer ${TOKEN}`);
  });

  it("REQ-NFR-020: rejects a token with whitespace inside", () => {
    expect(() =>
      createCloudflareClient({
        AccountId: ACCOUNT,
        ApiToken: "abc def",
        Fetch: fakeAccount().fetchFn,
      }),
    ).toThrow(/whitespace/);
  });
});
