// Vitest setup file shared by every workspace project (REQ-TEST-003).
//
// Unit, integration, and contract tests must not reach academic APIs or model
// providers. This guard replaces the global fetch and blocks outbound TCP
// connections, so a test that forgets to inject a stub fails instead of
// calling a live service. Tests that need fetch pass a stub explicitly or use
// vi.stubGlobal; vi.unstubAllGlobals restores this guard, not the real fetch.
import net from "node:net";

export const NETWORK_BLOCKED = "REQ-TEST-003: network access is blocked in tests";

export class NetworkBlockedError extends Error {
  constructor(target: string) {
    super(`${NETWORK_BLOCKED} (${target})`);
    this.name = "NetworkBlockedError";
  }
}

function describeRequest(input: unknown): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  if (input instanceof Request) return input.url;
  return "unknown request";
}

const blockedFetch: typeof fetch = (input) =>
  Promise.reject(new NetworkBlockedError(`fetch ${describeRequest(input)}`));

globalThis.fetch = blockedFetch;

// A Unix socket or named pipe (a `path` option or a non-numeric string) is
// local IPC, which the test runner itself may use. Anything with a port or
// host is a network connection and is refused.
function isLocalPipe(target: unknown): boolean {
  if (typeof target === "string") return Number.isNaN(Number(target));
  if (typeof target === "object" && target !== null && "path" in target) {
    return typeof (target as { path?: unknown }).path === "string";
  }
  return false;
}

function describeSocketTarget(target: unknown, host: unknown): string {
  if (typeof target === "object" && target !== null) {
    const options = target as { host?: unknown; port?: unknown };
    return `connect ${String(options.host ?? "localhost")}:${String(options.port)}`;
  }
  return `connect ${String(host ?? "localhost")}:${String(target)}`;
}

const originalConnect = net.Socket.prototype.connect;

net.Socket.prototype.connect = function guardedConnect(
  this: net.Socket,
  ...args: unknown[]
): net.Socket {
  const [first, second] = args;
  const target = Array.isArray(first) ? first[0] : first;
  if (!isLocalPipe(target)) {
    throw new NetworkBlockedError(describeSocketTarget(target, second));
  }
  return (originalConnect as (...connectArgs: unknown[]) => net.Socket).apply(this, args);
} as typeof net.Socket.prototype.connect;
