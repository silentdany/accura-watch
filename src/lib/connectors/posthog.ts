import type { Connector, ConnectorResult } from "./types";

const DEFAULT_HOST = "https://eu.posthog.com";

type TrendSeries = {
  count?: number;
  data?: number[];
  aggregated_value?: number;
};

type QueryResponse = {
  results?: TrendSeries[];
};

function parseTrendCount(body: unknown): number | null {
  if (!body || typeof body !== "object") return null;
  const results = (body as QueryResponse).results;
  if (!Array.isArray(results) || results.length === 0) return null;
  const series = results[0];
  if (!series || typeof series !== "object") return null;

  if (typeof series.count === "number" && Number.isFinite(series.count)) {
    return series.count;
  }
  if (
    typeof series.aggregated_value === "number" &&
    Number.isFinite(series.aggregated_value)
  ) {
    return series.aggregated_value;
  }
  if (Array.isArray(series.data) && series.data.length > 0) {
    const sum = series.data.reduce(
      (acc, n) => acc + (typeof n === "number" && Number.isFinite(n) ? n : 0),
      0,
    );
    return sum;
  }
  return null;
}

async function trendsQuery(
  host: string,
  projectId: string,
  token: string,
  math: "total" | "unique" | "dau",
): Promise<{ ok: true; count: number; math: string } | { ok: false; error: string; status?: number; bodyPreview?: string }> {
  const url = `${host.replace(/\/$/, "")}/api/projects/${encodeURIComponent(projectId)}/query/`;
  const body = {
    query: {
      kind: "TrendsQuery",
      series: [
        {
          kind: "EventsNode",
          event: "$pageview",
          name: "$pageview",
          math,
        },
      ],
      dateRange: { date_from: "-7d" },
      interval: "day",
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(12_000),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return {
      ok: false,
      error: `PostHog API ${res.status}`,
      status: res.status,
      bodyPreview: text.slice(0, 200),
    };
  }

  const json = (await res.json()) as unknown;
  const count = parseTrendCount(json);
  if (count === null) {
    return {
      ok: false,
      error: "PostHog response missing count/data",
      bodyPreview: JSON.stringify(json).slice(0, 200),
    };
  }
  return { ok: true, count, math };
}

/**
 * PostHog connector — per-site project via Site.config.posthogProjectId.
 * Env: POSTHOG_API_KEY + POSTHOG_HOST (default https://eu.posthog.com).
 * US cloud: https://app.posthog.com (or https://us.posthog.com).
 * No project id on site → skipped (ok:true). Key missing but project set → not configured.
 * Metrics: pageviews7d (math total), activeUsers7d (math unique, fallback dau).
 */
export const posthogConnector: Connector = {
  id: "posthog",
  label: "PostHog",
  async collect(ctx) {
    const token = process.env.POSTHOG_API_KEY;
    const host = (process.env.POSTHOG_HOST ?? DEFAULT_HOST).replace(/\/$/, "");
    const projectId = ctx.siteConfig?.posthogProjectId ?? null;

    if (!projectId) {
      return [
        {
          source: "posthog",
          key: "activeUsers7d",
          valueText: "skipped",
          ok: true,
          meta: {
            configured: false,
            skipped: true,
            reason: "no posthogProjectId",
          },
        },
        {
          source: "posthog",
          key: "pageviews7d",
          valueText: "skipped",
          ok: true,
          meta: {
            configured: false,
            skipped: true,
            reason: "no posthogProjectId",
          },
        },
      ];
    }

    if (!token) {
      return [
        {
          source: "posthog",
          key: "activeUsers7d",
          valueText: "not configured",
          ok: false,
          meta: {
            configured: false,
            projectId,
            host,
            reason: "missing POSTHOG_API_KEY",
          },
        },
        {
          source: "posthog",
          key: "pageviews7d",
          valueText: "not configured",
          ok: false,
          meta: {
            configured: false,
            projectId,
            host,
            reason: "missing POSTHOG_API_KEY",
          },
        },
      ];
    }

    try {
      const pageviews = await trendsQuery(host, projectId, token, "total");

      let active = await trendsQuery(host, projectId, token, "unique");
      let activeMath: string = "unique";
      if (!active.ok) {
        // unique may be rejected depending on PostHog version — fall back to dau
        const dau = await trendsQuery(host, projectId, token, "dau");
        if (dau.ok) {
          active = dau;
          activeMath = "dau";
        }
      } else {
        activeMath = active.math;
      }

      const results: ConnectorResult[] = [];

      if (active.ok) {
        results.push({
          source: "posthog",
          key: "activeUsers7d",
          value: active.count,
          valueText: String(active.count),
          ok: true,
          meta: {
            configured: true,
            projectId,
            host,
            math: activeMath,
            note:
              activeMath === "dau"
                ? "unique rejected; summed daily active users (dau)"
                : "7d unique users via math unique",
          },
        });
      } else {
        results.push({
          source: "posthog",
          key: "activeUsers7d",
          valueText: "error",
          ok: false,
          error: active.error,
          meta: {
            configured: true,
            projectId,
            host,
            status: active.status,
            bodyPreview: active.bodyPreview,
          },
        });
      }

      if (pageviews.ok) {
        results.push({
          source: "posthog",
          key: "pageviews7d",
          value: pageviews.count,
          valueText: String(pageviews.count),
          ok: true,
          meta: {
            configured: true,
            projectId,
            host,
            math: "total",
          },
        });
      } else {
        results.push({
          source: "posthog",
          key: "pageviews7d",
          valueText: "error",
          ok: false,
          error: pageviews.error,
          meta: {
            configured: true,
            projectId,
            host,
            status: pageviews.status,
            bodyPreview: pageviews.bodyPreview,
          },
        });
      }

      return results;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "PostHog fetch failed";
      return [
        {
          source: "posthog",
          key: "activeUsers7d",
          valueText: "error",
          ok: false,
          error: message,
          meta: { configured: true, projectId, host },
        },
        {
          source: "posthog",
          key: "pageviews7d",
          valueText: "error",
          ok: false,
          error: message,
          meta: { configured: true, projectId, host },
        },
      ];
    }
  },
};
