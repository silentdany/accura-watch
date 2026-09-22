/** JSON shape stored in Site.config */
export type SiteConfig = {
  /** Sentry project slug under SENTRY_ORG (e.g. brieform). Absent = skip Sentry. */
  sentryProject?: string;
  /**
   * Google Search Console property URL.
   * Examples: `https://accura.dev/` or `sc-domain:accura.dev`.
   * Absent = skip GSC for this site.
   */
  gscSiteUrl?: string;
};

export function parseSiteConfig(raw: unknown): SiteConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const o = raw as Record<string, unknown>;

  const sentryProject =
    typeof o.sentryProject === "string" && o.sentryProject.trim()
      ? o.sentryProject.trim()
      : undefined;

  const gscRaw = o.gscSiteUrl ?? o.gscProperty ?? o.gscSite;
  const gscSiteUrl =
    typeof gscRaw === "string" && gscRaw.trim() ? gscRaw.trim() : undefined;

  return { sentryProject, gscSiteUrl };
}
