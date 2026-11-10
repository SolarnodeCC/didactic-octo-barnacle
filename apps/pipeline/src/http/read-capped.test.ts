import { describe, expect, it } from "vitest";

import { DEFAULT_MAX_RESPONSE_BYTES, readTextCapped } from "./read-capped.js";
import { HttpRequestError } from "./retry.js";

function streamed(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(body, { status: 200 });
}

describe("REQ-NFR-021: capped response bodies", () => {
  it("REQ-NFR-021: reads a body within the limit, including multi-byte characters", async () => {
    const text = await readTextCapped(streamed(["Ü", "ber ", "€"]), 64);
    expect(text).toBe("Über €");
  });

  it("REQ-NFR-021: refuses a body that grows past the limit without a declared length", async () => {
    await expect(readTextCapped(streamed(["12345", "67890"]), 8)).rejects.toBeInstanceOf(
      HttpRequestError,
    );
  });

  it("REQ-NFR-021: refuses a declared length over the limit before reading", async () => {
    const response = new Response("small", { headers: { "content-length": "999999999" } });
    await expect(readTextCapped(response, 1024)).rejects.toThrow(/larger than 1024 bytes/u);
  });

  it("REQ-NFR-021: the default cap is 16 MiB", () => {
    expect(DEFAULT_MAX_RESPONSE_BYTES).toBe(16 * 1024 * 1024);
  });
});
