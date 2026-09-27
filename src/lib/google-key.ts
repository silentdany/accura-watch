import { createPrivateKey } from "node:crypto";

/**
 * Service-account private keys arrive mangled in many ways once they go
 * through env vars and dashboards: wrapped in quotes, "\n" kept literally,
 * newlines turned into spaces, the whole JSON key file pasted, base64-encoded…
 * Normalize all of these to a valid PEM, or throw a readable error.
 */
export function normalizePrivateKey(raw: string): string {
  let key = raw.trim();

  // Whole service-account JSON pasted instead of the key.
  if (key.startsWith("{")) {
    try {
      const j = JSON.parse(key) as { private_key?: string };
      if (j.private_key) key = j.private_key.trim();
    } catch {
      /* not JSON, keep going */
    }
  }

  // Wrapping quotes (from .env files or copy-paste).
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1).trim();
  }

  key = key.replace(/\\r/g, "").replace(/\\n/g, "\n").replace(/\r/g, "");

  // Base64 of the whole PEM.
  if (!key.includes("-----BEGIN") && /^[A-Za-z0-9+/=\s]+$/.test(key)) {
    const decoded = Buffer.from(key.replace(/\s+/g, ""), "base64").toString("utf8");
    key = decoded.includes("-----BEGIN") ? decoded.trim() : wrapPem(key);
  }

  // Rebuild the PEM body: fixes keys whose newlines became spaces or were stripped.
  const m = key.match(/-----BEGIN ([A-Z ]+)-----([\s\S]*?)-----END \1-----/);
  if (m) {
    const body = m[2].replace(/[^A-Za-z0-9+/=]/g, "");
    key = `-----BEGIN ${m[1]}-----\n${body.match(/.{1,64}/g)?.join("\n") ?? ""}\n-----END ${m[1]}-----\n`;
  }

  try {
    createPrivateKey(key);
  } catch {
    throw new Error(
      "Invalid Google service-account private key. Paste the `private_key` value from the JSON key file " +
        "(starting with -----BEGIN PRIVATE KEY-----), or the whole JSON file.",
    );
  }
  return key;
}

function wrapPem(b64: string): string {
  const body = b64.replace(/\s+/g, "");
  return `-----BEGIN PRIVATE KEY-----\n${body.match(/.{1,64}/g)?.join("\n") ?? ""}\n-----END PRIVATE KEY-----\n`;
}

/** Extract { clientEmail, privateKey } from a service-account JSON string, if it is one. */
export function parseServiceAccountJson(raw: string | null): { clientEmail: string; privateKey: string } | null {
  if (!raw) return null;
  let s = raw.trim();
  if (!s.startsWith("{")) {
    // Allow base64-encoded JSON (common for env vars).
    try {
      const d = Buffer.from(s, "base64").toString("utf8").trim();
      if (d.startsWith("{")) s = d;
    } catch {
      return null;
    }
  }
  try {
    const j = JSON.parse(s) as { client_email?: string; private_key?: string };
    return j.client_email && j.private_key ? { clientEmail: j.client_email, privateKey: j.private_key } : null;
  } catch {
    return null;
  }
}
