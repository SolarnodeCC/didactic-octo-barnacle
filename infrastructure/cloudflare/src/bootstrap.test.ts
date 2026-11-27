import { describe, expect, it, vi } from "vitest";

import {
  bootstrapEnvironment,
  desiredResources,
  reportDrift,
  type DesiredResource,
  type ResourceClient,
} from "./bootstrap.js";

function memoryClient(seed: DesiredResource[] = []): ResourceClient {
  const store = new Map(seed.map((resource) => [`${resource.Kind}:${resource.Name}`, resource]));
  return {
    async list() {
      return [...store.values()];
    },
    async create(resource) {
      store.set(`${resource.Kind}:${resource.Name}`, resource);
    },
  };
}

describe("REQ-NFR-020: environment bootstrap is idempotent", () => {
  it("REQ-NFR-020: plans the full resource set for an environment", () => {
    const resources = desiredResources("preview");
    expect(resources.map((resource) => resource.Name)).toEqual([
      "roi-preview",
      "roi-documents-preview",
      "roi-search-fixtures-preview",
      "roi-publications-preview",
      "roi-publications-dlq-preview",
      "roi-documents-preview",
      "roi-documents-dlq-preview",
      "roi-texts-preview",
      "roi-texts-dlq-preview",
      "roi-models-preview",
      "roi-models-dlq-preview",
      "roi-embeddings-preview",
      "roi-embeddings-dlq-preview",
      "roi-publications-preview",
      "source@roi-publications-preview",
      "published_day@roi-publications-preview",
      "roi-preview",
    ]);
  });

  it("REQ-NFR-020: reports missing resources as drift", () => {
    const drift = reportDrift("local", [{ Kind: "d1", Name: "roi-local" }]);
    expect(drift.Missing.length).toBe(desiredResources("local").length - 1);
    expect(drift.Ok).toEqual([{ Kind: "d1", Name: "roi-local" }]);
  });

  it("REQ-NFR-020: apply creates missing resources and a second run creates nothing", async () => {
    const client = memoryClient();
    const first = await bootstrapEnvironment({
      Environment: "staging",
      Mode: "apply",
      Client: client,
    });
    expect(first.Created.length).toBe(desiredResources("staging").length);
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
});

/**
 * Like Vectorize: a created metadata index shows up in `list()` only from the
 * `listedAfter`-th list after its creation (Infinity: never).
 */
function asyncMetadataClient(listedAfter: number, seed: DesiredResource[] = []): ResourceClient {
  const store = new Map(seed.map((resource) => [`${resource.Kind}:${resource.Name}`, resource]));
  const listsLeft = new Map<string, number>();
  return {
    async list() {
      const visible = [...store.entries()].filter(([key]) => (listsLeft.get(key) ?? 0) <= 1);
      for (const [key, left] of listsLeft) {
        listsLeft.set(key, left - 1);
      }
      return visible.map(([, resource]) => resource);
    },
    async create(resource) {
      const key = `${resource.Kind}:${resource.Name}`;
      store.set(key, resource);
      if (resource.Kind === "vectorize-metadata-index") {
        listsLeft.set(key, listedAfter);
      }
    },
  };
}

const metadataIndexes = (environment: "staging") =>
  desiredResources(environment).filter((resource) => resource.Kind === "vectorize-metadata-index");

describe("REQ-NFR-020: apply waits for asynchronous Vectorize metadata indexes", () => {
  it("REQ-NFR-020: apply waits until created Vectorize metadata indexes are listed", async () => {
    const sleep = vi.fn(async () => {});
    const result = await bootstrapEnvironment({
      Environment: "staging",
      Mode: "apply",
      Client: asyncMetadataClient(3),
      Wait: { TimeoutMs: 300_000, IntervalMs: 10_000, Sleep: sleep },
    });

    expect(result.Created).toEqual(desiredResources("staging"));
    expect(result.Drift.Missing).toEqual([]);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(10_000);
    expect(result.Message).toBe(
      "Applied 17 resource(s) for staging; missing now 0 (waited for 2 metadata index(es)).",
    );
  });

  it("REQ-NFR-020: a metadata index never listed stays missing after the bounded wait", async () => {
    const sleep = vi.fn(async () => {});
    const result = await bootstrapEnvironment({
      Environment: "staging",
      Mode: "apply",
      Client: asyncMetadataClient(Infinity),
      Wait: { TimeoutMs: 30_000, IntervalMs: 10_000, Sleep: sleep },
    });

    expect(sleep).toHaveBeenCalledTimes(3);
    expect(result.Drift.Missing).toEqual(metadataIndexes("staging"));
    expect(result.Message).toBe(
      "Applied 17 resource(s) for staging; missing now 2 (2 metadata index(es) not listed after 30 s).",
    );
  });

  it("REQ-NFR-020: apply does not wait when no metadata index was created", async () => {
    const sleep = vi.fn(async () => {});
    const seed = desiredResources("staging").filter((resource) => resource.Kind !== "queue");
    const result = await bootstrapEnvironment({
      Environment: "staging",
      Mode: "apply",
      Client: asyncMetadataClient(Infinity, seed),
      Wait: { Sleep: sleep },
    });

    expect(result.Created.every((resource) => resource.Kind === "queue")).toBe(true);
    expect(result.Drift.Missing).toEqual([]);
    expect(sleep).not.toHaveBeenCalled();
  });
});

describe("REQ-NFR-020: Durable Object namespaces are left to the Worker deploy", () => {
  it("REQ-NFR-020: the bootstrap plan has no Durable Object namespace (ADR 0027)", () => {
    expect(JSON.stringify(desiredResources("staging"))).not.toMatch(/durable/i);
  });
});

describe("REQ-NFR-003: drift includes AI Gateways with authentication off (ADR 0120)", () => {
  it("REQ-NFR-003: an existing gateway with Authenticated false is unauthenticated drift", () => {
    const drift = reportDrift("production", [
      { Kind: "ai-gateway", Name: "roi-production", Authenticated: false },
    ]);
    expect(drift.Unauthenticated).toEqual([{ Kind: "ai-gateway", Name: "roi-production" }]);
    expect(drift.Ok).toContainEqual({ Kind: "ai-gateway", Name: "roi-production" });
  });

  it("REQ-NFR-003: an authenticated gateway is not drift", () => {
    const drift = reportDrift("production", [
      { Kind: "ai-gateway", Name: "roi-production", Authenticated: true },
    ]);
    expect(drift.Unauthenticated).toEqual([]);
  });
});
