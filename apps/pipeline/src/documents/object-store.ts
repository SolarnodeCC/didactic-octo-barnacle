/** The slice of the R2 bucket API the pipeline uses. `R2Bucket` satisfies it. */
export interface ObjectStore {
  head(key: string): Promise<unknown | null>;
  get(key: string): Promise<{ text(): Promise<string> } | null>;
  list(options: { prefix: string; cursor?: string }): Promise<{
    objects: Array<{ key: string }>;
    truncated: boolean;
    cursor?: string;
  }>;
  put(
    key: string,
    value: Uint8Array,
    options?: { httpMetadata?: { contentType: string }; customMetadata?: Record<string, string> },
  ): Promise<unknown>;
}

/** Hex SHA-256 of the file: the content hash that keys a stored PDF (REQ-DATA-004 AC2). */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function pdfKey(contentHash: string): string {
  return `pdfs/${contentHash}.pdf`;
}
