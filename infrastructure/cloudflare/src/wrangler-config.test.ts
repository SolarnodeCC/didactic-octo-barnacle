import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const wrangler = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");

describe("REQ-NFR-021: Worker exposure", () => {
  it("REQ-NFR-021: turns off workers.dev and preview URLs for every environment", () => {
    expect(wrangler).toMatch(/^workers_dev\s*=\s*false$/m);
    expect(wrangler).toMatch(/^preview_urls\s*=\s*false$/m);
    expect(wrangler).not.toMatch(/^\s*(workers_dev|preview_urls)\s*=\s*true/m);
  });

  it("REQ-NFR-021: sets both flags before the first table, so every environment inherits them", () => {
    const firstTable = wrangler.search(/^\[/m);
    expect(wrangler.search(/^workers_dev\s*=/m)).toBeLessThan(firstTable);
    expect(wrangler.search(/^preview_urls\s*=/m)).toBeLessThan(firstTable);
  });
});
