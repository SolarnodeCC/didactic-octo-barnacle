import { HttpRequestError } from "./retry.js";

/**
 * The most a collector reads from one API response (REQ-NFR-021, ADR 0073). A page of 100
 * works or entries is well under 2 MB; the cap stops a broken or hostile upstream from
 * filling the Worker's memory.
 */
export const DEFAULT_MAX_RESPONSE_BYTES = 16 * 1024 * 1024;

function tooLarge(maxBytes: number, status: number): HttpRequestError {
  return new HttpRequestError(`response is larger than ${maxBytes} bytes`, 1, status);
}

/**
 * Reads a response body as text, and stops with an `HttpRequestError` as soon as it is
 * longer than `maxBytes`, whether or not the server declared a length.
 */
export async function readTextCapped(response: Response, maxBytes: number): Promise<string> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw tooLarge(maxBytes, response.status);
  }
  const reader = response.body?.getReader();
  if (!reader) {
    return "";
  }
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw tooLarge(maxBytes, response.status);
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}
