/**
 * Rules for a PDF URL before it is fetched (REQ-DATA-010 AC4). The fetcher is the only
 * code that downloads PDFs, and it applies these rules to the first URL and to every
 * redirect. Workers cannot resolve DNS, so the rules work on the host name: they refuse
 * IP addresses and names that point inside a network, and Cloudflare does not route a
 * Worker's requests to its own internal network.
 */
export type UrlPolicy = {
  /** When set, only these hosts and their subdomains may be fetched. Empty means any public host. */
  AllowedHosts: readonly string[];
};

export type UrlCheck = { Ok: true; Url: URL } | { Ok: false; Reason: string };

const INTERNAL_SUFFIXES = [".localhost", ".local", ".internal", ".lan", ".home.arpa", ".intranet"];

/**
 * Public wildcard-DNS services: `10.0.0.1.nip.io` is a public name that resolves to the
 * address inside it. The Worker cannot resolve DNS, so these names are refused up front
 * (ADR 0029, REQ-NFR-021).
 */
const WILDCARD_DNS_DOMAINS = [
  "nip.io",
  "sslip.io",
  "xip.io",
  "localtest.me",
  "lvh.me",
  "local.gd",
  "vcap.me",
  "traefik.me",
  "lacolhost.com",
];

/** An IPv4 address written into a name, as `10.0.0.1.example.org` or `10-0-0-1.example.org`. */
const EMBEDDED_IPV4 = /(^|[.-])\d{1,3}([.-])\d{1,3}\2\d{1,3}\2\d{1,3}($|[.-])/;

function isIpLiteral(host: string): boolean {
  // `new URL` turns decimal, octal, and hex IPv4 forms into dotted form first.
  return host.startsWith("[") || /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

function matchesAllowed(host: string, allowed: readonly string[]): boolean {
  return allowed.some((entry) => {
    const name = entry.toLowerCase().replace(/^\./, "");
    return host === name || host.endsWith(`.${name}`);
  });
}

export function checkPdfUrl(raw: string, policy: UrlPolicy): UrlCheck {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { Ok: false, Reason: "not a valid URL" };
  }
  if (url.protocol !== "https:") {
    return { Ok: false, Reason: "only https is allowed" };
  }
  if (url.username !== "" || url.password !== "") {
    return { Ok: false, Reason: "credentials in the URL are not allowed" };
  }
  if (url.port !== "" && url.port !== "443") {
    return { Ok: false, Reason: "only port 443 is allowed" };
  }

  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (isIpLiteral(host)) {
    return { Ok: false, Reason: "IP addresses are not allowed" };
  }
  if (!host.includes(".") || host === "localhost") {
    return { Ok: false, Reason: "host is not a public name" };
  }
  if (INTERNAL_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    return { Ok: false, Reason: "host looks internal" };
  }
  if (
    WILDCARD_DNS_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`)) ||
    EMBEDDED_IPV4.test(host)
  ) {
    return { Ok: false, Reason: "host name embeds an IP address" };
  }
  if (policy.AllowedHosts.length > 0 && !matchesAllowed(host, policy.AllowedHosts)) {
    return { Ok: false, Reason: `host ${host} is not on the allowlist` };
  }
  return { Ok: true, Url: url };
}
