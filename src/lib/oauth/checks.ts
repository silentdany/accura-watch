import { createHash } from "node:crypto";

/** Single scope: full access to this instance, same as a hand-made API token. */
export const MCP_SCOPE = "mcp";

const DENY_SCHEMES = new Set(["javascript", "data", "file", "blob", "filesystem", "vbscript", "about", "chrome", "chrome-extension"]);

export function isLoopback(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

/** Unwrap an IPv4-mapped IPv6 address (`::ffff:127.0.0.1` or `::ffff:7f00:1`). */
function unwrapMappedIpv4(address: string): string {
  const dotted = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(address);
  if (dotted) return dotted[1];
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(address);
  if (!hex) return address;
  const hi = Number.parseInt(hex[1], 16);
  const lo = Number.parseInt(hex[2], 16);
  return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
}

/** True for loopback, link-local, private and shared (CGNAT) addresses. */
export function isPrivateAddress(address: string): boolean {
  const a = unwrapMappedIpv4(address.toLowerCase().replace(/^\[|\]$/g, ""));
  if (a === "::1" || a === "0:0:0:0:0:0:0:1" || a === "0.0.0.0") return true;
  if (a.includes(":") && (a.startsWith("fe80:") || a.startsWith("fc") || a.startsWith("fd"))) return true;
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(a);
  if (!m) return false;
  const n = Number(m[1]);
  const b = Number(m[2]);
  if (n === 10 || n === 127 || n === 0) return true;
  if (n === 169 && b === 254) return true;
  if (n === 172 && b >= 16 && b <= 31) return true;
  if (n === 192 && b === 168) return true;
  if (n === 100 && b >= 64 && b <= 127) return true;
  return false;
}

/**
 * Redirect targets a public client may register.
 * https on a public host, http only on loopback, or a private-use app scheme
 * (desktop clients). Fragments and userinfo are rejected.
 */
export function validateRedirectUri(uri: string): boolean {
  if (!uri || uri.length > 500 || /[\s#\\]/.test(uri)) return false;
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  if (url.username || url.password) return false;
  const scheme = url.protocol.slice(0, -1).toLowerCase();
  if (DENY_SCHEMES.has(scheme)) return false;
  if (scheme === "https") return !isLoopback(url.hostname) && !isPrivateAddress(url.hostname);
  if (scheme === "http") return isLoopback(url.hostname);
  return /^[a-z][a-z0-9+.-]{1,40}$/.test(scheme) && (url.hostname.length > 0 || url.pathname.length > 1);
}

/**
 * Registered redirect vs the one in this request.
 * Public URIs must match exactly. Loopback http ignores the port: native clients
 * (Claude Code) register `http://localhost/callback` and then listen on an ephemeral port.
 */
export function redirectMatches(registered: string, requested: string): boolean {
  if (registered === requested) return true;
  let a: URL;
  let b: URL;
  try {
    a = new URL(registered);
    b = new URL(requested);
  } catch {
    return false;
  }
  if (a.protocol !== "http:" || b.protocol !== "http:") return false;
  if (!isLoopback(a.hostname) || !isLoopback(b.hostname)) return false;
  if (a.hostname.toLowerCase() !== b.hostname.toLowerCase()) return false;
  if (a.username || a.password || b.username || b.password) return false;
  return a.pathname === b.pathname && a.search === b.search;
}

/** Canonical resource identifier: lowercase scheme and host, no query, fragment or trailing slash. */
export function canonicalResource(uri: string): string | null {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password || url.hash || url.search) return null;
  const path = url.pathname.replace(/\/+$/, "");
  return `${url.protocol}//${url.host}${path}`;
}

export function pkceS256(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function validCodeVerifier(verifier: string): boolean {
  return /^[A-Za-z0-9._~-]{43,128}$/.test(verifier);
}

export function validCodeChallenge(challenge: string): boolean {
  return /^[A-Za-z0-9_-]{43,128}$/.test(challenge);
}
