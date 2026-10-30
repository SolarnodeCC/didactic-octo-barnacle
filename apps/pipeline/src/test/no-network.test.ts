import { afterEach, describe, expect, it, vi } from "vitest";

describe("REQ-TEST-003: unit tests do not call live external APIs", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("REQ-TEST-003: fails when a test attempts to fetch the network", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.reject(new Error("REQ-TEST-003: unexpected network fetch in unit tests")),
      ),
    );

    await expect(fetch("https://api.openalex.org/works")).rejects.toThrow(/REQ-TEST-003/);
  });
});
