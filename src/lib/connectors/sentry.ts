import type { Connector, ConnectorResult } from "./types";

/**
 * Sentry connector - per-site project via Site.config.sentryProject.
 * Env: SENTRY_AUTH_TOKEN + SENTRY_ORG (default accura-9m).
 * No sentryProject on site -> skipped (not an error).
 * Optional SENTRY_PROJECT env = transitional fallback only.
 */
export const sentryConnector: Connector = {
  id: "sentry",
  label: "Sentry",
  async collect(ctx) {
    const token = process.env.SENTRY_AUTH_TOKEN;
    const org = process.env.SENTRY_ORG ?? "accura-9m";
    const project =
      ctx.siteConfig?.sentryProject ?? process.env.SENTRY_PROJECT ?? null;

    if (!project) {
      return [
        {
          source: "sentry",
          key: "unresolved",
          valueText: "skipped",
          ok: true,
          meta: {
            configured: false,
            skipped: true,
            reason: "no sentryProject",
          },
        },
      ];
    }

    if (!token) {
      return [
        {
          source: "sentry",
          key: "unresolved",
          valueText: "not configured",
          ok: false,
          meta: {
            configured: false,
            org,
            project,
            reason: "missing SENTRY_AUTH_TOKEN",
          },
        },
      ];
    }

    try {
      const url = new URL(
        `https://sentry.io/api/0/projects/${encodeURIComponent(org)}/${encodeURIComponent(project)}/issues/`,
      );
      url.searchParams.set("query", "is:unresolved");
      url.searchParams.set("statsPeriod", "14d");

      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(12_000),
        cache: "no-store",
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return [
          {
            source: "sentry",
            key: "unresolved",
            valueText: "error",
            ok: false,
            error: `Sentry API ${res.status}`,
            meta: {
              configured: true,
              org,
              project,
              status: res.status,
              bodyPreview: text.slice(0, 200),
            },
          },
        ];
      }

      const hitsHeader = res.headers.get("X-Hits");
      const issues = (await res.json()) as unknown[];
      const count =
        hitsHeader !== null && hitsHeader !== ""
          ? Number.parseInt(hitsHeader, 10)
          : Array.isArray(issues)
            ? issues.length
            : 0;

      const results: ConnectorResult[] = [
        {
          source: "sentry",
          key: "unresolved",
          value: Number.isFinite(count) ? count : 0,
          valueText: String(Number.isFinite(count) ? count : 0),
          ok: true,
          meta: { configured: true, org, project },
        },
      ];
      return results;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Sentry fetch failed";
      return [
        {
          source: "sentry",
          key: "unresolved",
          valueText: "error",
          ok: false,
          error: message,
          meta: { configured: true, org, project },
        },
      ];
    }
  },
};
