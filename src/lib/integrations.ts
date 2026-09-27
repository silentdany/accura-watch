import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decryptJson, encryptJson } from "@/lib/crypto";
import { env } from "@/lib/env";

/**
 * Provider credentials live in the `Integration` table (set from Settings or
 * the MCP server). Env vars are a fallback so the app also works fully
 * config-as-code (e.g. on Vercel).
 */

export type GoogleCreds =
  | { mode: "oauth"; refreshToken: string; email?: string | null }
  | { mode: "service_account"; clientEmail: string; privateKey: string };

export type PosthogCreds = { apiKey: string; host: string };
export type SentryCreds = { token: string; org: string; host: string };
export type DataForSeoCreds = {
  login: string;
  password: string;
  locationCode: number;
  languageCode: string;
  backlinks: boolean;
  cadenceDays: number;
};
export type OpenPageRankCreds = { apiKey: string };
export type AhrefsCreds = { apiKey: string };

export type ProviderId = "google" | "posthog" | "sentry" | "dataforseo" | "openpagerank" | "ahrefs";

export const PROVIDERS: { id: ProviderId; label: string; feeds: string }[] = [
  { id: "google", label: "Google Search Console", feeds: "Clicks, impressions, CTR, position, top queries & pages" },
  { id: "posthog", label: "PostHog", feeds: "Visitors, pageviews, top pages & referrers" },
  { id: "sentry", label: "Sentry", feeds: "Unresolved issues, error events per day" },
  { id: "dataforseo", label: "DataForSEO", feeds: "Domain rank, backlinks, referring domains, organic keywords & traffic" },
  { id: "openpagerank", label: "Open PageRank", feeds: "Free domain authority score (0–10)" },
  { id: "ahrefs", label: "Ahrefs (free)", feeds: "Free Domain Rating (0–100) — no paid plan needed" },
];

type Row = { config: Record<string, unknown>; secret: Record<string, unknown> };

async function readRow(provider: ProviderId): Promise<Row | null> {
  const row = await prisma.integration.findUnique({ where: { provider } });
  if (!row) return null;
  return {
    config: (row.config as Record<string, unknown> | null) ?? {},
    secret: row.secret ? (decryptJson<Record<string, unknown>>(row.secret) ?? {}) : {},
  };
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

export async function getGoogleCreds(): Promise<GoogleCreds | null> {
  const row = await readRow("google");
  if (row) {
    const refreshToken = str(row.secret.refreshToken);
    if (refreshToken) return { mode: "oauth", refreshToken, email: str(row.config.email) };
    const clientEmail = str(row.secret.clientEmail);
    const privateKey = str(row.secret.privateKey);
    if (clientEmail && privateKey) return { mode: "service_account", clientEmail, privateKey };
  }
  const clientEmail = env("GSC_CLIENT_EMAIL");
  const privateKey = env("GSC_PRIVATE_KEY");
  if (clientEmail && privateKey) return { mode: "service_account", clientEmail, privateKey };
  return null;
}

export async function getPosthogCreds(): Promise<PosthogCreds | null> {
  const row = await readRow("posthog");
  const apiKey = str(row?.secret.apiKey) ?? env("POSTHOG_API_KEY");
  if (!apiKey) return null;
  const host = (str(row?.config.host) ?? env("POSTHOG_HOST") ?? "https://us.posthog.com").replace(/\/+$/, "");
  return { apiKey, host };
}

export async function getSentryCreds(): Promise<SentryCreds | null> {
  const row = await readRow("sentry");
  const token = str(row?.secret.token) ?? env("SENTRY_AUTH_TOKEN");
  if (!token) return null;
  const host = (str(row?.config.host) ?? env("SENTRY_HOST") ?? "https://sentry.io").replace(/\/+$/, "");
  const org = str(row?.config.org) ?? env("SENTRY_ORG") ?? (await discoverSentryOrg(token, host));
  if (!org) return null;
  return { token, org, host };
}

const sentryOrgCache = new Map<string, string | null>();

/** No org configured → use the token's first organization. */
async function discoverSentryOrg(token: string, host: string): Promise<string | null> {
  const key = `${host}|${token.slice(-8)}`;
  if (sentryOrgCache.has(key)) return sentryOrgCache.get(key)!;
  let slug: string | null = null;
  try {
    const res = await fetch(`${host}/api/0/organizations/`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (res.ok) slug = ((await res.json()) as { slug: string }[])[0]?.slug ?? null;
  } catch {
    /* leave null */
  }
  sentryOrgCache.set(key, slug);
  return slug;
}

export async function getDataForSeoCreds(): Promise<DataForSeoCreds | null> {
  const row = await readRow("dataforseo");
  const login = str(row?.secret.login) ?? env("DATAFORSEO_LOGIN");
  const password = str(row?.secret.password) ?? env("DATAFORSEO_PASSWORD");
  if (!login || !password) return null;
  const c = row?.config ?? {};
  return {
    login,
    password,
    locationCode: Number(c.locationCode ?? env("DATAFORSEO_LOCATION_CODE") ?? 2840) || 2840,
    languageCode: str(c.languageCode) ?? env("DATAFORSEO_LANGUAGE_CODE") ?? "en",
    backlinks: c.backlinks === undefined ? true : Boolean(c.backlinks),
    cadenceDays: Math.max(1, Number(c.cadenceDays ?? 7) || 7),
  };
}

export async function getAhrefsCreds(): Promise<AhrefsCreds | null> {
  const row = await readRow("ahrefs");
  const apiKey = str(row?.secret.apiKey) ?? env("AHREFS_API_KEY");
  return apiKey ? { apiKey } : null;
}

export async function getOpenPageRankCreds(): Promise<OpenPageRankCreds | null> {
  const row = await readRow("openpagerank");
  const apiKey = str(row?.secret.apiKey) ?? env("OPENPAGERANK_API_KEY");
  return apiKey ? { apiKey } : null;
}

/**
 * Upsert a provider. `secret` keys with empty values keep their previous value
 * (so forms can leave password fields blank).
 */
export async function saveIntegration(
  provider: ProviderId,
  config: Record<string, unknown>,
  secret: Record<string, unknown> | null,
): Promise<void> {
  const prev = await readRow(provider);
  let nextSecret: Record<string, unknown> | null = prev?.secret ?? null;
  if (secret) {
    nextSecret = { ...(prev?.secret ?? {}) };
    for (const [k, v] of Object.entries(secret)) {
      if (v === null) delete nextSecret[k];
      else if (v !== undefined && v !== "") nextSecret[k] = v;
    }
  }
  const data = {
    config: { ...(prev?.config ?? {}), ...config } as Prisma.InputJsonValue,
    secret: nextSecret && Object.keys(nextSecret).length ? encryptJson(nextSecret) : null,
  };
  await prisma.integration.upsert({
    where: { provider },
    create: { provider, ...data },
    update: data,
  });
}

export async function deleteIntegration(provider: ProviderId): Promise<void> {
  await prisma.integration.deleteMany({ where: { provider } });
}

export type IntegrationStatus = {
  id: ProviderId;
  label: string;
  feeds: string;
  connected: boolean;
  source: "database" | "env" | null;
  detail: string | null;
  config: Record<string, unknown>;
};

/** Non-secret view for the Settings page and the MCP server. */
export async function integrationStatuses(): Promise<IntegrationStatus[]> {
  const rows = await prisma.integration.findMany();
  const byId = new Map(rows.map((r) => [r.provider, r]));
  const [google, posthog, sentry, dfs, opr, ahrefs] = await Promise.all([
    getGoogleCreds(),
    getPosthogCreds(),
    getSentryCreds(),
    getDataForSeoCreds(),
    getOpenPageRankCreds(),
    getAhrefsCreds(),
  ]);
  const detail: Record<ProviderId, string | null> = {
    google: google
      ? google.mode === "oauth"
        ? `OAuth${google.email ? ` · ${google.email}` : ""}`
        : `Service account · ${google.clientEmail}`
      : null,
    posthog: posthog ? posthog.host.replace(/^https?:\/\//, "") : null,
    sentry: sentry ? `${sentry.org} · ${sentry.host.replace(/^https?:\/\//, "")}` : null,
    dataforseo: dfs
      ? `${dfs.login} · loc ${dfs.locationCode}/${dfs.languageCode} · every ${dfs.cadenceDays}d${dfs.backlinks ? " · backlinks" : ""}`
      : null,
    openpagerank: opr ? "API key set" : null,
    ahrefs: ahrefs ? "API key set · Domain Rating by Ahrefs" : null,
  };
  const connected: Record<ProviderId, boolean> = {
    google: !!google,
    posthog: !!posthog,
    sentry: !!sentry,
    dataforseo: !!dfs,
    openpagerank: !!opr,
    ahrefs: !!ahrefs,
  };
  return PROVIDERS.map((p) => {
    const row = byId.get(p.id);
    return {
      ...p,
      connected: connected[p.id],
      source: connected[p.id] ? (row?.secret ? "database" : "env") : null,
      detail: detail[p.id],
      config: (row?.config as Record<string, unknown> | null) ?? {},
    };
  });
}
