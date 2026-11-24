/**
 * Verification of the Cloudflare Access token on every API request (REQ-REV-005 AC2, ADR 0116).
 * Access already blocks other users at the edge; this check keeps the data closed when the
 * Access application is missing or misconfigured.
 */

export const ACCESS_HEADER = "Cf-Access-Jwt-Assertion";

/** How long the team's signing keys are reused before they are fetched again. */
const KEY_TTL_MS = 10 * 60 * 1000;
/** Clock skew allowed on `exp` and `nbf`. */
const SKEW_SECONDS = 60;

export type AccessConfig = {
  /** The team domain, for example `example.cloudflareaccess.com`. */
  TeamDomain: string;
  /** The audience (AUD) tag of the Access application. */
  Audience: string;
  Fetch: typeof fetch;
  Now: () => number;
};

export type AccessIdentity = { Subject: string };

/** The RSA public key fields of a JSON Web Key, as Access publishes them. */
type Jwk = { kty?: string; kid?: string; n?: string; e?: string };

type KeyCache = { TeamDomain: string; FetchedAt: number; Keys: Map<string, CryptoKey> };

const TEAM_DOMAIN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.cloudflareaccess\.com$/u;

/** The team domain as a bare host name, or null when it is not a Cloudflare Access domain. */
export function normaliseTeamDomain(value: string | undefined): string | null {
  const host = (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https:\/\//u, "")
    .replace(/\/+$/u, "");
  return TEAM_DOMAIN.test(host) ? host : null;
}

function base64UrlDecode(part: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]*$/u.test(part)) {
    throw new Error("not base64url");
  }
  const base64 = part.replace(/-/gu, "+").replace(/_/gu, "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function decodeJson(part: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(base64UrlDecode(part)));
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Verifies Access tokens and keeps the team's public keys between requests of one isolate. */
export class AccessVerifier {
  private cache: KeyCache | null = null;

  constructor(private readonly config: AccessConfig) {}

  /** The identity in a valid token, or null for a missing, malformed, or invalid one. */
  async verify(token: string | null): Promise<AccessIdentity | null> {
    if (!token) {
      return null;
    }
    const parts = token.split(".");
    if (parts.length !== 3) {
      return null;
    }
    const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];
    const header = decodeJson(headerPart);
    const payload = decodeJson(payloadPart);
    if (!header || !payload || header.alg !== "RS256" || typeof header.kid !== "string") {
      return null;
    }
    if (!this.claimsValid(payload)) {
      return null;
    }
    const key = await this.key(header.kid);
    if (!key) {
      return null;
    }
    let signature: Uint8Array<ArrayBuffer>;
    try {
      signature = base64UrlDecode(signaturePart);
    } catch {
      return null;
    }
    const signed = new TextEncoder().encode(`${headerPart}.${payloadPart}`);
    const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, signed);
    return valid ? { Subject: payload.sub as string } : null;
  }

  private claimsValid(payload: Record<string, unknown>): boolean {
    const now = Math.floor(this.config.Now() / 1000);
    const audience = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    return (
      audience.includes(this.config.Audience) &&
      payload.iss === `https://${this.config.TeamDomain}` &&
      typeof payload.exp === "number" &&
      payload.exp + SKEW_SECONDS > now &&
      (payload.nbf === undefined ||
        (typeof payload.nbf === "number" && payload.nbf - SKEW_SECONDS <= now)) &&
      typeof payload.sub === "string" &&
      payload.sub.length > 0
    );
  }

  /** The key for `kid`; an unknown key ID refreshes the keys once (key rotation). */
  private async key(kid: string): Promise<CryptoKey | null> {
    const fresh =
      this.cache !== null &&
      this.cache.TeamDomain === this.config.TeamDomain &&
      this.config.Now() - this.cache.FetchedAt < KEY_TTL_MS;
    if (fresh && this.cache?.Keys.has(kid)) {
      return this.cache.Keys.get(kid) ?? null;
    }
    this.cache = await this.fetchKeys();
    return this.cache?.Keys.get(kid) ?? null;
  }

  private async fetchKeys(): Promise<KeyCache | null> {
    const response = await this.config.Fetch(
      `https://${this.config.TeamDomain}/cdn-cgi/access/certs`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (!response.ok) {
      return null;
    }
    const body = (await response.json()) as { keys?: Jwk[] };
    const keys = new Map<string, CryptoKey>();
    for (const jwk of body.keys ?? []) {
      if (jwk.kty !== "RSA" || !jwk.kid || !jwk.n || !jwk.e) {
        continue;
      }
      keys.set(
        jwk.kid,
        await crypto.subtle.importKey(
          "jwk",
          { kty: jwk.kty, n: jwk.n, e: jwk.e },
          { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
          false,
          ["verify"],
        ),
      );
    }
    return { TeamDomain: this.config.TeamDomain, FetchedAt: this.config.Now(), Keys: keys };
  }
}
