import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const wrangler = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");

describe("REQ-NFR-021: data API Worker exposure (ADR 0058)", () => {
  it("REQ-NFR-021: turns off workers.dev and preview URLs before the first table", () => {
    const firstTable = wrangler.search(/^\[/m);
    expect(wrangler.search(/^workers_dev\s*=\s*false$/m)).toBeGreaterThan(-1);
    expect(wrangler.search(/^workers_dev\s*=/m)).toBeLessThan(firstTable);
    expect(wrangler.search(/^preview_urls\s*=\s*false$/m)).toBeLessThan(firstTable);
    expect(wrangler).not.toMatch(/^\s*(workers_dev|preview_urls)\s*=\s*true/m);
  });

  it("REQ-NFR-021: has no staging or production section and no route until phase 4 adds authentication", () => {
    expect(wrangler).not.toMatch(/^\[env\.(staging|production)/m);
    expect(wrangler).not.toMatch(/^\s*routes?\s*=/m);
    expect(wrangler).toMatch(/^\[env\.preview\]$/m);
  });
});
