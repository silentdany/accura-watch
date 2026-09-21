import type { SiteId } from "@/lib/sites";
import { SITES } from "@/lib/sites";
import type { MetricSnapshot, MetricsConnector } from "@/lib/connectors/types";

/**
 * Stub connector: HEAD/GET the public URL, measure latency.
 * Replace with Vercel API / uptime provider later.
 */
export const stubConnector: MetricsConnector = {
  async fetchMetrics(siteId: SiteId): Promise<MetricSnapshot> {
    const site = SITES.find((s) => s.id === siteId);
    if (!site) {
      return {
        siteId,
        health: {
          status: "unknown",
          statusCode: null,
          latencyMs: null,
          checkedAt: new Date().toISOString(),
          detail: "Unknown siteId",
        },
      };
    }

    const started = Date.now();
    try {
      const res = await fetch(site.url, {
        method: "HEAD",
        cache: "no-store",
        signal: AbortSignal.timeout(8_000),
      });
      const latencyMs = Date.now() - started;
      const status =
        res.ok ? "up" : res.status >= 500 ? "down" : "degraded";
      return {
        siteId,
        health: {
          status,
          statusCode: res.status,
          latencyMs,
          checkedAt: new Date().toISOString(),
        },
      };
    } catch (err) {
      return {
        siteId,
        health: {
          status: "down",
          statusCode: null,
          latencyMs: Date.now() - started,
          checkedAt: new Date().toISOString(),
          detail: err instanceof Error ? err.message : "fetch failed",
        },
      };
    }
  },
};
