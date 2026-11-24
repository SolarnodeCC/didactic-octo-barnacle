/**
 * Response helpers with the security headers of ADR 0016 (REQ-REV-005 AC3). The static assets
 * get the same headers from `web/public/_headers`.
 */

export const CONTENT_SECURITY_POLICY =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "Content-Security-Policy": CONTENT_SECURITY_POLICY,
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "no-store",
};

export type ErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not-found"
  | "validation"
  | "method-not-allowed"
  | "not-configured";

const STATUS: Record<ErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  "not-found": 404,
  validation: 400,
  "method-not-allowed": 405,
  "not-configured": 503,
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...SECURITY_HEADERS, "Content-Type": "application/json; charset=utf-8" },
  });
}

export function errorResponse(code: ErrorCode, message: string): Response {
  return json({ Error: { Code: code, Message: message } }, STATUS[code]);
}

export function jsonLines(lines: unknown[], filename: string): Response {
  const body = lines.map((line) => JSON.stringify(line)).join("\n") + (lines.length ? "\n" : "");
  return new Response(body, {
    headers: {
      ...SECURITY_HEADERS,
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

/**
 * A state-changing request must carry an `Origin` equal to the request's own origin
 * (REQ-NFR-014, ADR 0016). No CORS is offered, so other origins cannot read responses either.
 */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("Origin");
  return origin !== null && origin === new URL(request.url).origin;
}
