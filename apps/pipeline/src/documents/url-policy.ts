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
  // DNS rebinding services: the name answers with an address chosen by whoever wrote it.
  "rbndr.us",
  "1u.ms",
];

/**
 * The platform's own domain (ADR 0026). A PDF URL comes from publication metadata that
 * outside authors control, so it must never point the fetcher at the dashboard or API.
 * Refused even when `AllowedHosts` lists it (REQ-NFR-021).
 */
const PLATFORM_DOMAINS = ["wispel.cc"];

/** An IPv4 address written into a name, as `10.0.0.1.example.org` or `10-0-0-1.example.org`. */
const EMBEDDED_IPV4 = /(^|[.-])\d{1,3}([.-])\d{1,3}\2\d{1,3}\2\d{1,3}($|[.-])/;

/** An IPv4 address written as one 8-digit hex label, as `7f000001.example.org`. */
const HEX_IPV4_LABEL = /^[0-9a-f]{8}$/;

/**
 * An IPv6 address written with dashes, as `fe80--1.example.org` or `--1.example.org`.
 * Punycode labels (`xn--`) are international names, not addresses.
 */
const DASHED_IPV6_LABEL = /^(?!xn--)[0-9a-f-]*--[0-9a-f-]*$/;

/** Loopback, private, link-local, shared, benchmark, multicast, and reserved IPv4 ranges. */
function isNonPublicIpv4(a: number, b: number): boolean {
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168)) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

/**
 * True when a label of the name encodes an address the fetcher must not reach. A hex label
 * is refused only when it decodes to a non-public address, because 8 hex characters also
 * occur in ordinary names. A refused host is logged by name (ADR 0029).
 */
function hasEncodedAddressLabel(host: string): boolean {
  return host.split(".").some((label) => {
    if (DASHED_IPV6_LABEL.test(label)) {
      return true;
    }
    if (!HEX_IPV4_LABEL.test(label) || !/\d/.test(label)) {
      return false;
    }
    return isNonPublicIpv4(parseInt(label.slice(0, 2), 16), parseInt(label.slice(2, 4), 16));
  });
}

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
  if (!host.includes(".") || host.split(".").includes("localhost")) {
    return { Ok: false, Reason: "host is not a public name" };
  }
  if (INTERNAL_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    return { Ok: false, Reason: "host looks internal" };
  }
  if (
    WILDCARD_DNS_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`)) ||
    EMBEDDED_IPV4.test(host) ||
    hasEncodedAddressLabel(host)
  ) {
    return { Ok: false, Reason: "host name embeds an IP address" };
  }
  if (PLATFORM_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`))) {
    return { Ok: false, Reason: "host is the platform's own domain" };
  }
  if (policy.AllowedHosts.length > 0 && !matchesAllowed(host, policy.AllowedHosts)) {
    return { Ok: false, Reason: `host ${host} is not on the allowlist` };
  }
  return { Ok: true, Url: url };
}
