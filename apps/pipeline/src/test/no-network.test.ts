import http from "node:http";
import net from "node:net";
import { describe, expect, it } from "vitest";

// These tests exercise the shared setup file test-support/no-network.ts,
// which every Vitest project loads. They call the real globals without
// stubbing them, so they fail if the guard is missing.
describe("REQ-TEST-003: unit tests do not call live external APIs", () => {
  it("REQ-TEST-003: the global fetch refuses a request that no test stubbed", async () => {
    await expect(fetch("https://api.openalex.org/works")).rejects.toThrow(
      /REQ-TEST-003: network access is blocked in tests \(fetch https:\/\/api\.openalex\.org\/works\)/,
    );
  });

  it("REQ-TEST-003: a raw TCP connection is refused", () => {
    expect(() => net.connect({ host: "export.arxiv.org", port: 443 })).toThrow(/REQ-TEST-003/);
  });

  it("REQ-TEST-003: an http request is refused before it reaches the network", () => {
    expect(() => http.get("http://api.openalex.org/works")).toThrow(/REQ-TEST-003/);
  });
});
