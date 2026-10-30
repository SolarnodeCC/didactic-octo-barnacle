import { describe, expect, it } from "vitest";

import { checkPdfUrl } from "./url-policy.js";

const open = { AllowedHosts: [] as string[] };

function refused(url: string, policy = open): string {
  const result = checkPdfUrl(url, policy);
  if (result.Ok) {
    throw new Error(`expected ${url} to be refused`);
  }
  return result.Reason;
}

describe("REQ-DATA-010: PDF URL policy", () => {
  it("REQ-DATA-010: accepts an https URL on a public host", () => {
    const result = checkPdfUrl("https://repository.example.org/papers/1.pdf?x=1", open);
    expect(result.Ok).toBe(true);
  });

  it("REQ-DATA-010: refuses anything but https", () => {
    expect(refused("http://example.org/a.pdf")).toMatch(/https/);
    expect(refused("ftp://example.org/a.pdf")).toMatch(/https/);
    expect(refused("file:///etc/passwd")).toMatch(/https/);
    expect(refused("javascript:alert(1)")).toMatch(/https/);
  });

  it("REQ-DATA-010: refuses IP addresses in every notation", () => {
    for (const url of [
      "https://127.0.0.1/a.pdf",
      "https://10.0.0.5/a.pdf",
      "https://169.254.169.254/latest/meta-data",
      "https://192.168.1.1/a.pdf",
      "https://[::1]/a.pdf",
      "https://[fd00::1]/a.pdf",
      "https://2130706433/a.pdf", // 127.0.0.1 as a decimal number
      "https://0x7f000001/a.pdf", // hex
      "https://0177.0.0.1/a.pdf", // octal
      "https://8.8.8.8/a.pdf",
    ]) {
      expect(refused(url), url).toMatch(/IP address/);
    }
  });

  it("REQ-DATA-010: refuses names that point inside a network", () => {
    for (const url of [
      "https://localhost/a.pdf",
      "https://app.localhost/a.pdf",
      "https://printer.local/a.pdf",
      "https://db.internal/a.pdf",
      "https://files.corp.lan/a.pdf",
      "https://router.home.arpa/a.pdf",
      "https://intranet/a.pdf",
      "https://metadata/a.pdf",
    ]) {
      expect(refused(url), url).toMatch(/public name|internal/);
    }
  });

  it("REQ-DATA-010: refuses credentials, odd ports, and a trailing-dot trick", () => {
    expect(refused("https://user:pw@example.org/a.pdf")).toMatch(/credentials/);
    expect(refused("https://example.org:8443/a.pdf")).toMatch(/port 443/);
    expect(refused("https://localhost./a.pdf")).toMatch(/public name/);
    expect(checkPdfUrl("https://example.org:443/a.pdf", open).Ok).toBe(true);
  });

  it("REQ-DATA-010: an allowlist limits fetching to the listed hosts and their subdomains", () => {
    const policy = { AllowedHosts: ["europepmc.org", ".example.edu"] };
    expect(checkPdfUrl("https://europepmc.org/a.pdf", policy).Ok).toBe(true);
    expect(checkPdfUrl("https://files.europepmc.org/a.pdf", policy).Ok).toBe(true);
    expect(checkPdfUrl("https://cs.example.edu/a.pdf", policy).Ok).toBe(true);
    expect(refused("https://evil-europepmc.org/a.pdf", policy)).toMatch(/allowlist/);
    expect(refused("https://europepmc.org.evil.com/a.pdf", policy)).toMatch(/allowlist/);
  });

  it("REQ-DATA-010: refuses text that is not a URL", () => {
    expect(refused("not a url")).toMatch(/valid URL/);
    expect(refused("")).toMatch(/valid URL/);
  });
});
