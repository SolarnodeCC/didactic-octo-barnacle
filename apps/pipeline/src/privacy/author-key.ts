/** Raised when the key that protects the erasure list is missing; ingestion must stop. */
export class ErasureConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErasureConfigError";
  }
}

/** A keyed, one-way pseudonym for a stored author ID. */
export type AuthorKeyHasher = (authorId: string) => Promise<string>;

const MIN_SECRET_LENGTH = 32;

/**
 * HMAC-SHA256 of the author ID with the Worker secret `ERASURE_HASH_KEY`. The erasure list
 * holds only these hashes, so it does not itself store a name or an ORCID, and without the
 * key an ORCID cannot be tested against it. Without a usable key every call fails:
 * ingestion then stops instead of storing an erased author again (REQ-NFR-016).
 */
export function createAuthorKeyHasher(secret: string | undefined): AuthorKeyHasher {
  let key: ReturnType<typeof crypto.subtle.importKey> | undefined;

  return async (authorId) => {
    if (!secret || secret.length < MIN_SECRET_LENGTH) {
      throw new ErasureConfigError(
        `ERASURE_HASH_KEY must be set to a secret of at least ${MIN_SECRET_LENGTH} characters`,
      );
    }
    key ??= crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signature = await crypto.subtle.sign(
      "HMAC",
      await key,
      new TextEncoder().encode(authorId),
    );
    return [...new Uint8Array(signature)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  };
}
