import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const wrangler = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");

describe("REQ-REV-005: review Worker exposure", () => {
  it("REQ-REV-005: turns off workers.dev and preview URLs before the first table", () => {
    const firstTable = wrangler.search(/^\[/m);
    expect(wrangler.search(/^workers_dev\s*=\s*false$/m)).toBeGreaterThan(-1);
    expect(wrangler.search(/^workers_dev\s*=/m)).toBeLessThan(firstTable);
    expect(wrangler.search(/^preview_urls\s*=\s*false$/m)).toBeLessThan(firstTable);
    expect(wrangler).not.toMatch(/^\s*(workers_dev|preview_urls)\s*=\s*true/m);
  });

  it("REQ-REV-005: routes only staging, to review.wispel.cc as a custom domain", () => {
    const routes = wrangler.match(/^routes\s*=.*$/gm) ?? [];
    expect(routes).toEqual(['routes = [{ pattern = "review.wispel.cc", custom_domain = true }]']);
    const stagingStart = wrangler.indexOf("[env.staging]");
    expect(wrangler.indexOf(routes[0] as string)).toBeGreaterThan(stagingStart);
    expect(wrangler).not.toMatch(/^\[env\.(preview|production)/m);
  });

  it("REQ-REV-005: keeps the development Access bypass out of staging", () => {
    expect(wrangler).toMatch(/ENVIRONMENT = "staging",.*ACCESS_DEV_SUBJECT = ""/);
  });

  it("REQ-REV-005: runs the Worker only for the API and serves the app for other paths", () => {
    expect(wrangler).toContain('run_worker_first = ["/api/*"]');
    expect(wrangler).toContain('not_found_handling = "single-page-application"');
  });
});
