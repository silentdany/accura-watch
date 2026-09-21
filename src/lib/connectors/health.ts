import type { Connector, ConnectorResult } from "./types";

/**
 * Health stub — HEAD/GET the site URL and record latency + status.
 * V1 returns a mock when fetch fails (offline / no network in build).
 */
export const healthConnector: Connector = {
  id: "health",
  label: "Health",
  async collect(ctx) {
    const started = Date.now();
    try {
      const res = await fetch(ctx.siteUrl, {
        method: "HEAD",
        redirect: "follow",
        signal: AbortSignal.timeout(8_000),
        cache: "no-store",
      });
      const latencyMs = Date.now() - started;
      const results: ConnectorResult[] = [
        {
          source: "health",
          key: "status_code",
          value: res.status,
          ok: res.ok,
        },
        {
          source: "health",
          key: "latency_ms",
          value: latencyMs,
          ok: true,
        },
        {
          source: "health",
          key: "up",
          value: res.ok ? 1 : 0,
          valueText: res.ok ? "up" : "down",
          ok: res.ok,
        },
      ];
      return results;
    } catch (err) {
      const message = err instanceof Error ? err.message : "health check failed";
      return [
        {
          source: "health",
          key: "up",
          value: 0,
          valueText: "down",
          ok: false,
          error: message,
          meta: { stub: true },
        },
      ];
    }
  },
};
