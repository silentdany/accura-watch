import type { Connector, ConnectorResult } from "./types";

const TIMEOUT_MS = 12_000;
/** Free Domain Rating endpoint (no API units). Requires free APIv3 key. */
const DR_FREE_URL = "https://api.ahrefs.com/v3/public/domain-rating-free";

function hostnameFromSiteUrl(siteUrl: string): string | null {
  try {
    const host = new URL(siteUrl).hostname.trim().toLowerCase();
    if (!host) return null;
    return host.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function parseDomainRating(payload: unknown): number | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;

  // Shape: { domain_rating: { domain_rating: 46.0, license: "..." } }
  const nested = root.domain_rating;
  if (nested && typeof nested === "object") {
    const dr = (nested as Record<string, unknown>).domain_rating;
    if (typeof dr === "number" && Number.isFinite(dr)) return dr;
  }

  // Defensive flat aliases
  for (const key of ["domain_rating", "domainRating", "dr"] as const) {
    const v = root[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

/**
 * Ahrefs Domain Rating (free tier) — target derived from site URL hostname.
 * Env: AHREFS_API_KEY. No Site.config id. No backlinks/organic endpoints.
 * Absent key → skipped (ok:true).
 */
export const ahrefsConnector: Connector = {
  id: "ahrefs",
  label: "Ahrefs DR",
  async collect(ctx) {
    const apiKey = process.env.AHREFS_API_KEY?.trim() || null;
    const target = hostnameFromSiteUrl(ctx.siteUrl);
    const checkedAt = new Date().toISOString();

    if (!apiKey) {
      return [
        {
          source: "ahrefs",
          key: "dr",
          valueText: "skipped",
          ok: true,
          meta: {
            configured: false,
            isConfigured: false,
            skipped: true,
            reason: "missing AHREFS_API_KEY",
            target,
            checkedAt,
          },
        },
      ];
    }

    if (!target) {
      return [
        {
          source: "ahrefs",
          key: "dr",
          valueText: "error",
          ok: false,
          error: "invalid siteUrl hostname",
          meta: {
            configured: true,
            isConfigured: true,
            error: "invalid siteUrl hostname",
            siteUrl: ctx.siteUrl,
            checkedAt,
          },
        },
      ];
    }

    try {
      const url = new URL(DR_FREE_URL);
      url.searchParams.set("target", target);
      url.searchParams.set("output", "json");

      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });

      const text = await res.text().catch(() => "");
      if (!res.ok) {
        return [
          {
            source: "ahrefs",
            key: "dr",
            valueText: "error",
            ok: false,
            error: `Ahrefs API ${res.status}`,
            meta: {
              configured: true,
              isConfigured: true,
              error: `Ahrefs API ${res.status}`,
              target,
              status: res.status,
              bodyPreview: text.slice(0, 200),
              checkedAt,
              endpoint: "v3/public/domain-rating-free",
            },
          },
        ];
      }

      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        return [
          {
            source: "ahrefs",
            key: "dr",
            valueText: "error",
            ok: false,
            error: "Ahrefs response is not JSON",
            meta: {
              configured: true,
              error: "Ahrefs response is not JSON",
              target,
              bodyPreview: text.slice(0, 200),
              checkedAt,
            },
          },
        ];
      }

      const dr = parseDomainRating(payload);
      if (dr === null) {
        return [
          {
            source: "ahrefs",
            key: "dr",
            valueText: "error",
            ok: false,
            error: "Ahrefs response missing domain_rating",
            meta: {
              configured: true,
              error: "Ahrefs response missing domain_rating",
              target,
              bodyPreview: text.slice(0, 200),
              checkedAt,
            },
          },
        ];
      }

      return [
        {
          source: "ahrefs",
          key: "dr",
          value: dr,
          valueText: String(dr),
          ok: true,
          meta: {
            configured: true,
            isConfigured: true,
            target,
            checkedAt,
            endpoint: "v3/public/domain-rating-free",
            attribution: "Domain Rating by Ahrefs",
          },
        },
      ] satisfies ConnectorResult[];
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Ahrefs fetch failed";
      return [
        {
          source: "ahrefs",
          key: "dr",
          valueText: "error",
          ok: false,
          error: message,
          meta: {
            configured: true,
            isConfigured: true,
            error: message,
            target,
            checkedAt,
          },
        },
      ];
    }
  },
};
