import { checkPdfUrl } from "./url-policy.js";

export type PdfFetchLimits = {
  MaxBytes: number;
  /** One deadline for all redirects and the whole body. */
  TimeoutMs: number;
  MaxRedirects: number;
  AllowedHosts: readonly string[];
};

export type PdfFetchErrorCode =
  | "blocked-url"
  | "too-large"
  | "timeout"
  | "not-pdf"
  | "http-status"
  | "too-many-redirects"
  | "network";

/**
 * `Permanent` errors will fail again for the same URL, so the message is completed
 * without a retry. The others (timeout, network, 429, 5xx) are retried by the queue.
 */
export class PdfFetchError extends Error {
  constructor(
    message: string,
    readonly Code: PdfFetchErrorCode,
    readonly Permanent: boolean,
  ) {
    super(message);
    this.name = "PdfFetchError";
  }
}

export type FetchedPdf = { Bytes: Uint8Array; FinalUrl: string };

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

async function readCapped(
  response: Response,
  maxBytes: number,
  signal: AbortSignal,
): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new PdfFetchError("response has no body", "not-pdf", true);
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      if (signal.aborted) {
        throw new PdfFetchError("download timed out", "timeout", false);
      }
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      total += value.byteLength;
      if (total > maxBytes) {
        throw new PdfFetchError(`file is larger than ${maxBytes} bytes`, "too-large", true);
      }
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    if (error instanceof PdfFetchError) {
      throw error;
    }
    throw new PdfFetchError(
      signal.aborted ? "download timed out" : "download failed",
      signal.aborted ? "timeout" : "network",
      false,
    );
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/**
 * The only code that downloads PDFs (REQ-DATA-010 AC4): https and public hosts only,
 * every redirect checked again, a size limit, one overall timeout, and a content-type
 * check backed by the file's first bytes. Cookies and credentials are never sent.
 */
export function createPdfFetcher(options: {
  Fetch: typeof fetch;
  Limits: PdfFetchLimits;
}): (url: string) => Promise<FetchedPdf> {
  const { Fetch: fetchFn, Limits: limits } = options;

  return async (startUrl) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), limits.TimeoutMs);
    try {
      let current = startUrl;
      for (let hop = 0; hop <= limits.MaxRedirects; hop += 1) {
        const check = checkPdfUrl(current, { AllowedHosts: limits.AllowedHosts });
        if (!check.Ok) {
          throw new PdfFetchError(`URL refused: ${check.Reason}`, "blocked-url", true);
        }

        let response: Response;
        try {
          response = await fetchFn(check.Url.toString(), {
            method: "GET",
            redirect: "manual",
            signal: controller.signal,
            headers: { accept: "application/pdf" },
          });
        } catch {
          throw controller.signal.aborted
            ? new PdfFetchError("request timed out", "timeout", false)
            : new PdfFetchError("request failed", "network", false);
        }

        if (REDIRECT_STATUSES.has(response.status)) {
          const location = response.headers.get("location");
          await response.body?.cancel().catch(() => undefined);
          if (!location) {
            throw new PdfFetchError("redirect without a location", "http-status", true);
          }
          current = new URL(location, check.Url).toString();
          continue;
        }
        if (!response.ok) {
          await response.body?.cancel().catch(() => undefined);
          throw new PdfFetchError(
            `HTTP ${response.status}`,
            "http-status",
            !isRetryableStatus(response.status),
          );
        }

        const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
        if (!contentType.startsWith("application/pdf")) {
          await response.body?.cancel().catch(() => undefined);
          throw new PdfFetchError(`content type is not application/pdf`, "not-pdf", true);
        }
        const declared = Number(response.headers.get("content-length"));
        if (Number.isFinite(declared) && declared > limits.MaxBytes) {
          await response.body?.cancel().catch(() => undefined);
          throw new PdfFetchError(
            `file is larger than ${limits.MaxBytes} bytes`,
            "too-large",
            true,
          );
        }

        const bytes = await readCapped(response, limits.MaxBytes, controller.signal);
        if (!PDF_MAGIC.every((byte, index) => bytes[index] === byte)) {
          throw new PdfFetchError("file does not start with %PDF-", "not-pdf", true);
        }
        return { Bytes: bytes, FinalUrl: check.Url.toString() };
      }
      throw new PdfFetchError(
        `more than ${limits.MaxRedirects} redirects`,
        "too-many-redirects",
        true,
      );
    } finally {
      clearTimeout(timer);
    }
  };
}
