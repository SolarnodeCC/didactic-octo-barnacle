import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { DEFAULT_INGEST_CONFIG, pdfHostPolicy } from "./config.js";
import PROVEN_HOSTS from "./documents/pdf-proven-hosts.json" with { type: "json" };
import { checkPdfUrl } from "./documents/url-policy.js";

const wrangler = readFileSync(
  new URL("../../../infrastructure/cloudflare/wrangler.toml", import.meta.url),
  "utf8",
);

describe("REQ-DATA-011: the PDF give-up point matches the document queue", () => {
  it("REQ-DATA-011: Pdf.MaxRetries equals max_retries of roi-documents in every environment", () => {
    // The consumer gives up on the delivery after the last retry (ADR 0073). If the two
    // numbers drift apart, PDFs are either dead-lettered again or given up too early.
    const consumers = [
      ...wrangler.matchAll(
        /queue = "roi-documents-(?!dlq-)[a-z]+"\n(?:[a-z_]+ = .*\n)*?max_retries = (\d+)/g,
      ),
    ];
    expect(consumers).toHaveLength(4);
    for (const consumer of consumers) {
      expect(Number(consumer[1])).toBe(DEFAULT_INGEST_CONFIG.Pdf.MaxRetries);
    }
  });
});

describe("REQ-DATA-010: deployed environments fetch PDFs only from allowlisted hosts (ADR 0116)", () => {
  it.each(["staging", "production"])(
    "REQ-DATA-010: %s requires the allowlist and allows the proven hosts",
    (environment) => {
      const policy = pdfHostPolicy(environment);
      expect(policy.RequireAllowlist).toBe(true);
      expect(policy.ExactHosts.has("arxiv.org")).toBe(true);
      expect(policy.ExactHosts.has("link.springer.com")).toBe(true);
      expect(policy.ExactHosts.size).toBe(PROVEN_HOSTS.length);
    },
  );

  it.each(["local", "preview"])("REQ-DATA-010: %s stays open for development", (environment) => {
    expect(pdfHostPolicy(environment)).toEqual({ ExactHosts: new Set(), RequireAllowlist: false });
  });

  it("REQ-DATA-010: an unknown environment name fails closed", () => {
    expect(pdfHostPolicy("prodution").RequireAllowlist).toBe(true);
    expect(pdfHostPolicy("").RequireAllowlist).toBe(true);
  });

  it("REQ-DATA-010: the proven host list is sorted, unique, lower-case host names that pass the hard rules", () => {
    expect(PROVEN_HOSTS.length).toBeGreaterThan(1000);
    expect([...PROVEN_HOSTS].sort()).toEqual(PROVEN_HOSTS);
    expect(new Set(PROVEN_HOSTS).size).toBe(PROVEN_HOSTS.length);
    for (const host of PROVEN_HOSTS) {
      expect(host, host).toMatch(
        /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/,
      );
      const check = checkPdfUrl(`https://${host}/a.pdf`, { AllowedHosts: [] });
      expect(check.Ok, `${host}: ${check.Ok ? "" : check.Reason}`).toBe(true);
    }
  });
});
