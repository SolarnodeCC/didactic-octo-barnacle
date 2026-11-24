import type {
  CurrentVerdict,
  RecordVerdictRequest,
  ReviewDetailResponse,
  ReviewListResponse,
  ReviewStatsResponse,
} from "@roi/models";

/** Calls of the review API. The Access cookie is sent by the browser; no token is handled here. */

export class ApiError extends Error {
  constructor(
    readonly Status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: "same-origin", ...init });
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const body = (await response.json()) as { Error?: { Message?: string } };
      message = body.Error?.Message ?? message;
    } catch {
      // Keep the status line: Access may answer with an HTML page.
    }
    throw new ApiError(response.status, message);
  }
  return (await response.json()) as T;
}

export type ListFilters = {
  accepted?: string;
  reason?: string;
  reviewed?: string;
  promptVersion?: string;
  day?: string;
};

export function listPublications(
  filters: ListFilters,
  cursor?: string,
): Promise<ReviewListResponse> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  if (cursor) params.set("cursor", cursor);
  const query = params.toString();
  return request(`/api/review/publications${query ? `?${query}` : ""}`);
}

export function getPublication(id: string): Promise<ReviewDetailResponse> {
  return request(`/api/review/publications/${encodeURIComponent(id)}`);
}

export function recordVerdict(body: RecordVerdictRequest): Promise<CurrentVerdict> {
  return request("/api/review/verdicts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function getStats(): Promise<ReviewStatsResponse> {
  return request("/api/review/stats");
}

export const EXPORT_PATH = "/api/review/export";
