import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { CONTENT_SECURITY_POLICY, sameOrigin } from "./http.js";

const headersFile = readFileSync(new URL("../web/public/_headers", import.meta.url), "utf8");

describe("REQ-REV-005: headers and origin check", () => {
  it("REQ-REV-005: the static assets send the same CSP as the API", () => {
    expect(headersFile).toContain(`Content-Security-Policy: ${CONTENT_SECURITY_POLICY}`);
    expect(headersFile).toContain("X-Content-Type-Options: nosniff");
    expect(CONTENT_SECURITY_POLICY).toMatch(/script-src 'self';/);
  });

  it("REQ-REV-005: accepts only an Origin equal to the request's own origin", () => {
    const make = (origin?: string) =>
      new Request("https://review.wispel.cc/api/review/verdicts", {
        method: "POST",
        headers: origin ? { Origin: origin } : {},
      });
    expect(sameOrigin(make("https://review.wispel.cc"))).toBe(true);
    expect(sameOrigin(make("https://wispel.cc"))).toBe(false);
    expect(sameOrigin(make("null"))).toBe(false);
    expect(sameOrigin(make())).toBe(false);
  });
});
