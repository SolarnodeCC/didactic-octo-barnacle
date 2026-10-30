import { describe, expect, it } from "vitest";

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
      "roi-publications-preview",
      "roi-publications-dlq-preview",
      "roi-publications-preview",
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

describe("REQ-NFR-020: Durable Object namespaces are left to the Worker deploy", () => {
  it("REQ-NFR-020: the bootstrap plan has no Durable Object namespace (ADR 0027)", () => {
    expect(JSON.stringify(desiredResources("staging"))).not.toMatch(/durable/i);
  });
});
