import { createSign } from "node:crypto";
import { fetchJson } from "@/lib/http";
import { appUrl, env } from "@/lib/env";
import { getGoogleCreds, type GoogleCreds } from "@/lib/integrations";
import { normalizePrivateKey } from "@/lib/google-key";

export const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/webmasters/v3";

// ─── OAuth app (for the "Connect with Google" button) ───────────────────────

export function googleOAuthApp(): { clientId: string; clientSecret: string } | null {
  const clientId = env("GOOGLE_CLIENT_ID");
  const clientSecret = env("GOOGLE_CLIENT_SECRET");
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export function googleRedirectUri(): string {
  return `${appUrl()}/api/integrations/google/callback`;
}

export function googleAuthorizeUrl(state: string): string | null {
  const app = googleOAuthApp();
  if (!app) return null;
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", app.clientId);
  u.searchParams.set("redirect_uri", googleRedirectUri());
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", `openid email ${GSC_SCOPE}`);
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("prompt", "consent");
  u.searchParams.set("include_granted_scopes", "true");
  u.searchParams.set("state", state);
  return u.toString();
}

export async function exchangeGoogleCode(
  code: string,
): Promise<{ refreshToken: string; email: string | null }> {
  const app = googleOAuthApp();
  if (!app) throw new Error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set");
  const { data } = await fetchJson<{ refresh_token?: string; id_token?: string }>(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: app.clientId,
      client_secret: app.clientSecret,
      redirect_uri: googleRedirectUri(),
      grant_type: "authorization_code",
    }),
    label: "Google token",
  });
  if (!data.refresh_token) {
    throw new Error("Google did not return a refresh token — revoke access at myaccount.google.com/permissions and retry");
  }
  let email: string | null = null;
  if (data.id_token) {
    try {
      const payload = JSON.parse(Buffer.from(data.id_token.split(".")[1], "base64url").toString("utf8"));
      email = typeof payload.email === "string" ? payload.email : null;
    } catch {
      /* ignore */
    }
  }
  return { refreshToken: data.refresh_token, email };
}

// ─── Access tokens ──────────────────────────────────────────────────────────

let cached: { key: string; token: string; exp: number } | null = null;

function b64url(input: Buffer | string): string {
  return (typeof input === "string" ? Buffer.from(input) : input).toString("base64url");
}

function serviceAccountAssertion(clientEmail: string, privateKey: string): string {
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(
    JSON.stringify({ iss: clientEmail, scope: GSC_SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 }),
  )}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  return `${unsigned}.${b64url(signer.sign(normalizePrivateKey(privateKey)))}`;
}

async function accessToken(creds: GoogleCreds): Promise<string> {
  const cacheKey = creds.mode === "oauth" ? creds.refreshToken : creds.clientEmail;
  if (cached && cached.key === cacheKey && cached.exp > Date.now() + 60_000) return cached.token;

  let body: URLSearchParams;
  if (creds.mode === "oauth") {
    const app = googleOAuthApp();
    if (!app) throw new Error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set (needed to refresh OAuth token)");
    body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: creds.refreshToken,
      client_id: app.clientId,
      client_secret: app.clientSecret,
    });
  } else {
    body = new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: serviceAccountAssertion(creds.clientEmail, creds.privateKey),
    });
  }
  const { data } = await fetchJson<{ access_token: string; expires_in?: number }>(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    label: "Google token",
  });
  cached = { key: cacheKey, token: data.access_token, exp: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return data.access_token;
}

async function gsc<T>(path: string, init: RequestInit = {}): Promise<T> {
  const creds = await getGoogleCreds();
  if (!creds) throw new Error("Google Search Console is not connected");
  const token = await accessToken(creds);
  const { data } = await fetchJson<T>(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    label: "Search Console",
  });
  return data;
}

// ─── Search Console API ─────────────────────────────────────────────────────

export type GscProperty = { siteUrl: string; permissionLevel: string };

export async function listGscProperties(): Promise<GscProperty[]> {
  const data = await gsc<{ siteEntry?: GscProperty[] }>("/sites");
  return (data.siteEntry ?? [])
    .filter((s) => s.permissionLevel !== "siteUnverifiedUser")
    .sort((a, b) => a.siteUrl.localeCompare(b.siteUrl));
}

export type GscDimension = "date" | "query" | "page" | "country" | "device" | "searchAppearance";

export type GscFilter = {
  dimension: "query" | "page" | "country" | "device" | "searchAppearance";
  operator?: "equals" | "notEquals" | "contains" | "notContains" | "includingRegex" | "excludingRegex";
  expression: string;
};

export type GscQuery = {
  startDate: string;
  endDate: string;
  dimensions?: GscDimension[];
  rowLimit?: number;
  startRow?: number;
  type?: "web" | "image" | "video" | "news" | "discover" | "googleNews";
  filters?: GscFilter[];
  dataState?: "final" | "all";
};

export type GscRow = {
  keys?: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export async function querySearchAnalytics(property: string, q: GscQuery): Promise<GscRow[]> {
  const body: Record<string, unknown> = {
    startDate: q.startDate,
    endDate: q.endDate,
    dimensions: q.dimensions ?? [],
    rowLimit: q.rowLimit ?? 1000,
    startRow: q.startRow ?? 0,
    type: q.type ?? "web",
    dataState: q.dataState ?? "final",
  };
  if (q.filters?.length) {
    body.dimensionFilterGroups = [
      {
        groupType: "and",
        filters: q.filters.map((f) => ({
          dimension: f.dimension,
          operator: f.operator ?? "contains",
          expression: f.expression,
        })),
      },
    ];
  }
  const data = await gsc<{ rows?: GscRow[] }>(
    `/sites/${encodeURIComponent(property)}/searchAnalytics/query`,
    { method: "POST", body: JSON.stringify(body) },
  );
  return data.rows ?? [];
}
