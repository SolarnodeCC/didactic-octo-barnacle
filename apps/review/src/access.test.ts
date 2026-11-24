import { describe, expect, it, vi } from "vitest";

import { AccessVerifier, normaliseTeamDomain } from "./access.js";
import { authenticator } from "./worker.js";

const TEAM = "example.cloudflareaccess.com";
const AUD = "aud-tag-123";
const NOW_MS = Date.UTC(2026, 10, 24, 12, 0, 0);
const NOW_S = Math.floor(NOW_MS / 1000);

function base64Url(bytes: Uint8Array | string): string {
  const data = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  let binary = "";
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
}

async function keyPair(): Promise<{ publicKey: CryptoKey; privateKey: CryptoKey }> {
  return crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
}

async function sign(
  key: CryptoKey,
  claims: Record<string, unknown>,
  header: Record<string, unknown> = { alg: "RS256", kid: "k1", typ: "JWT" },
): Promise<string> {
  const signed = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claims))}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signed),
  );
  return `${signed}.${base64Url(new Uint8Array(signature))}`;
}

const validClaims = {
  aud: [AUD],
  iss: `https://${TEAM}`,
  sub: "subject-1",
  email: "owner@example.org",
  exp: NOW_S + 600,
  iat: NOW_S - 10,
};

async function setup() {
  const pair = await keyPair();
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const fetchKeys = vi.fn((_input: string | URL | Request) =>
    Promise.resolve(Response.json({ keys: [{ ...jwk, kid: "k1" }] })),
  );
  const verifier = new AccessVerifier({
    TeamDomain: TEAM,
    Audience: AUD,
    Fetch: fetchKeys as unknown as typeof fetch,
    Now: () => NOW_MS,
  });
  return { pair, verifier, fetchKeys };
}

describe("REQ-REV-005: Access token verification", () => {
  it("REQ-REV-005: accepts a signed token for the audience and returns the opaque subject", async () => {
    const { pair, verifier, fetchKeys } = await setup();
    const token = await sign(pair.privateKey, validClaims);
    await expect(verifier.verify(token)).resolves.toEqual({ Subject: "subject-1" });
    expect(String(fetchKeys.mock.calls[0]?.[0])).toBe(`https://${TEAM}/cdn-cgi/access/certs`);
    await verifier.verify(token);
    expect(fetchKeys).toHaveBeenCalledTimes(1);
  });

  it("REQ-REV-005: refuses a missing, malformed, or unsigned token", async () => {
    const { pair, verifier } = await setup();
    await expect(verifier.verify(null)).resolves.toBeNull();
    await expect(verifier.verify("not.a.token")).resolves.toBeNull();
    const token = await sign(pair.privateKey, validClaims, { alg: "none", kid: "k1" });
    await expect(verifier.verify(token)).resolves.toBeNull();
  });

  it("REQ-REV-005: refuses another audience, another issuer, an expired token, or no subject", async () => {
    const { pair, verifier } = await setup();
    for (const claims of [
      { ...validClaims, aud: ["other"] },
      { ...validClaims, iss: "https://other.cloudflareaccess.com" },
      { ...validClaims, exp: NOW_S - 120 },
      { ...validClaims, nbf: NOW_S + 600 },
      { ...validClaims, sub: "" },
    ]) {
      await expect(verifier.verify(await sign(pair.privateKey, claims))).resolves.toBeNull();
    }
  });

  it("REQ-REV-005: refuses a token signed by another key or with a changed payload", async () => {
    const { pair, verifier } = await setup();
    const other = await keyPair();
    await expect(verifier.verify(await sign(other.privateKey, validClaims))).resolves.toBeNull();
    const token = await sign(pair.privateKey, validClaims);
    const [header, , signature] = token.split(".");
    const forged = `${header}.${base64Url(JSON.stringify({ ...validClaims, sub: "admin" }))}.${signature}`;
    await expect(verifier.verify(forged)).resolves.toBeNull();
  });

  it("REQ-REV-005: accepts only Cloudflare Access team domains", () => {
    expect(normaliseTeamDomain("https://Example.cloudflareaccess.com/")).toBe(TEAM);
    expect(normaliseTeamDomain("example.org")).toBeNull();
    expect(normaliseTeamDomain("")).toBeNull();
  });
});

describe("REQ-REV-005: authentication per environment", () => {
  it("REQ-REV-005: refuses every request while Access is not configured", () => {
    expect(authenticator({ DB: {} as never, ENVIRONMENT: "staging" })).toBeNull();
    expect(
      authenticator({ DB: {} as never, ENVIRONMENT: "staging", ACCESS_TEAM_DOMAIN: TEAM }),
    ).toBeNull();
  });

  it("REQ-REV-005: allows the development subject only in the local environment", async () => {
    const local = authenticator({
      DB: {} as never,
      ENVIRONMENT: "local",
      ACCESS_DEV_SUBJECT: "local-owner",
    });
    await expect(local?.(null)).resolves.toEqual({ Subject: "local-owner" });
    expect(
      authenticator({ DB: {} as never, ENVIRONMENT: "staging", ACCESS_DEV_SUBJECT: "local-owner" }),
    ).toBeNull();
  });
});
