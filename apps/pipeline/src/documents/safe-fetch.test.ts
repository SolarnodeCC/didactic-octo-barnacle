import { describe, expect, it, vi } from "vitest";

import { createPdfFetcher, PdfFetchError, type PdfFetchLimits } from "./safe-fetch.js";

const limits: PdfFetchLimits = {
  MaxBytes: 1000,
  TimeoutMs: 200,
  MaxRedirects: 3,
  AllowedHosts: [],
};

const PDF = new TextEncoder().encode("%PDF-1.7\nfake body");

function pdfResponse(body: BodyInit = PDF, headers: Record<string, string> = {}): Response {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "application/pdf", ...headers },
  });
}

function redirect(to: string, status = 302): Response {
  return new Response(null, { status, headers: { location: to } });
}

async function failure(promise: Promise<unknown>): Promise<PdfFetchError> {
  const error = await promise.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(PdfFetchError);
  return error as PdfFetchError;
}

function fetcherFor(...responses: Array<Response | (() => Promise<Response>)>) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetchFn = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    const next = responses.shift();
    if (next === undefined) {
      return Promise.reject(new Error("unexpected extra request"));
    }
    return typeof next === "function" ? next() : Promise.resolve(next);
  });
  return { fetchPdf: createPdfFetcher({ Fetch: fetchFn as typeof fetch, Limits: limits }), calls };
}

describe("REQ-DATA-010: PDF fetcher", () => {
  it("REQ-DATA-010: downloads a PDF and returns its bytes", async () => {
    const { fetchPdf, calls } = fetcherFor(pdfResponse());
    const result = await fetchPdf("https://repo.example.org/a.pdf");
    expect(new TextDecoder().decode(result.Bytes)).toContain("%PDF-1.7");
    expect(calls[0]?.init?.redirect).toBe("manual");
    expect(calls[0]?.init?.method).toBe("GET");
  });

  it("REQ-DATA-010: refuses a URL on an internal address without making a request", async () => {
    const { fetchPdf, calls } = fetcherFor(pdfResponse());
    const error = await failure(fetchPdf("https://169.254.169.254/latest/meta-data"));
    expect(error).toMatchObject({ Code: "blocked-url", Permanent: true });
    expect(calls).toHaveLength(0);
  });

  it("REQ-DATA-010: follows a redirect to another public host", async () => {
    const { fetchPdf, calls } = fetcherFor(
      redirect("https://cdn.example.org/real.pdf"),
      pdfResponse(),
    );
    const result = await fetchPdf("https://repo.example.org/a.pdf");
    expect(result.FinalUrl).toBe("https://cdn.example.org/real.pdf");
    expect(calls).toHaveLength(2);
  });

  it("REQ-DATA-010: resolves a relative redirect against the current URL", async () => {
    const { fetchPdf, calls } = fetcherFor(redirect("/files/real.pdf", 301), pdfResponse());
    await fetchPdf("https://repo.example.org/a.pdf");
    expect(calls[1]?.url).toBe("https://repo.example.org/files/real.pdf");
  });

  it("REQ-DATA-010: checks every redirect and refuses one that leads to an internal address", async () => {
    for (const target of [
      "http://repo.example.org/plain.pdf",
      "https://127.0.0.1/admin",
      "https://metadata.internal/token",
      "https://localhost/a.pdf",
    ]) {
      const { fetchPdf, calls } = fetcherFor(redirect(target), pdfResponse());
      const error = await failure(fetchPdf("https://repo.example.org/a.pdf"));
      expect(error.Code, target).toBe("blocked-url");
      expect(calls, target).toHaveLength(1);
    }
  });

  it("REQ-DATA-010: stops after too many redirects", async () => {
    const { fetchPdf } = fetcherFor(
      redirect("https://a.example.org/1"),
      redirect("https://a.example.org/2"),
      redirect("https://a.example.org/3"),
      redirect("https://a.example.org/4"),
    );
    const error = await failure(fetchPdf("https://repo.example.org/a.pdf"));
    expect(error).toMatchObject({ Code: "too-many-redirects", Permanent: true });
  });

  it("REQ-DATA-010: refuses a file whose declared size is over the limit", async () => {
    const { fetchPdf } = fetcherFor(pdfResponse(PDF, { "content-length": "5000" }));
    expect(await failure(fetchPdf("https://repo.example.org/a.pdf"))).toMatchObject({
      Code: "too-large",
      Permanent: true,
    });
  });

  it("REQ-DATA-010: stops reading a file that grows past the limit without declaring it", async () => {
    const chunk = new Uint8Array(400).fill(0x20);
    let pulled = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        controller.enqueue(pulled === 1 ? PDF : chunk);
      },
    });
    const { fetchPdf } = fetcherFor(pdfResponse(stream));
    const error = await failure(fetchPdf("https://repo.example.org/a.pdf"));
    expect(error.Code).toBe("too-large");
    expect(pulled).toBeLessThan(10);
  });

  it("REQ-DATA-010: refuses a response that is not served as application/pdf", async () => {
    const html = new Response("<html></html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    });
    const { fetchPdf } = fetcherFor(html);
    expect(await failure(fetchPdf("https://repo.example.org/landing"))).toMatchObject({
      Code: "not-pdf",
      Permanent: true,
    });
  });

  it("REQ-DATA-010: refuses a file served as PDF that does not start with %PDF-", async () => {
    const { fetchPdf } = fetcherFor(pdfResponse("<html>not a pdf</html>"));
    expect(await failure(fetchPdf("https://repo.example.org/a.pdf"))).toMatchObject({
      Code: "not-pdf",
    });
  });

  it("REQ-DATA-010: gives up on a slow server after the timeout and marks it retryable", async () => {
    const fetchFn = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      });
    });
    const fetchPdf = createPdfFetcher({
      Fetch: fetchFn as typeof fetch,
      Limits: { ...limits, TimeoutMs: 30 },
    });
    expect(await failure(fetchPdf("https://slow.example.org/a.pdf"))).toMatchObject({
      Code: "timeout",
      Permanent: false,
    });
  });

  it("REQ-DATA-010: a missing file is permanent, a server error is retryable", async () => {
    const gone = fetcherFor(new Response("", { status: 404 }));
    expect(await failure(gone.fetchPdf("https://repo.example.org/a.pdf"))).toMatchObject({
      Code: "http-status",
      Permanent: true,
    });
    const broken = fetcherFor(new Response("", { status: 503 }));
    expect(await failure(broken.fetchPdf("https://repo.example.org/a.pdf"))).toMatchObject({
      Code: "http-status",
      Permanent: false,
    });
    const limited = fetcherFor(new Response("", { status: 429 }));
    expect((await failure(limited.fetchPdf("https://repo.example.org/a.pdf"))).Permanent).toBe(
      false,
    );
  });

  it("REQ-DATA-010: a network error is retryable", async () => {
    const { fetchPdf } = fetcherFor(() => Promise.reject(new TypeError("fetch failed")));
    expect(await failure(fetchPdf("https://repo.example.org/a.pdf"))).toMatchObject({
      Code: "network",
      Permanent: false,
    });
  });

  it("REQ-DATA-010: an allowlist is applied to the first URL and to redirects", async () => {
    const fetchFn = vi.fn(() => Promise.resolve(redirect("https://other.example.com/a.pdf")));
    const fetchPdf = createPdfFetcher({
      Fetch: fetchFn as unknown as typeof fetch,
      Limits: { ...limits, AllowedHosts: ["repo.example.org"] },
    });
    const error = await failure(fetchPdf("https://repo.example.org/a.pdf"));
    expect(error.Code).toBe("blocked-url");
    expect(error.message).toMatch(/allowlist/);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
