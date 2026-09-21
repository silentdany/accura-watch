/** JSON shape stored in Site.config */
export type SiteConfig = {
  /** Sentry project slug under SENTRY_ORG (e.g. brieform). Absent = skip Sentry. */
  sentryProject?: string;
  /** PostHog project id (numeric string). Absent = skip PostHog for this site. */
  posthogProjectId?: string;
};

export function parseSiteConfig(raw: unknown): SiteConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const o = raw as Record<string, unknown>;
  const sentryProject =
    typeof o.sentryProject === "string" && o.sentryProject.trim()
      ? o.sentryProject.trim()
      : undefined;

  const posthogRaw =
    o.posthogProjectId ?? o.posthogProject ?? o.projectId;
  const posthogProjectId =
    typeof posthogRaw === "string" && posthogRaw.trim()
      ? posthogRaw.trim()
      : typeof posthogRaw === "number" && Number.isFinite(posthogRaw)
        ? String(posthogRaw)
        : undefined;

  return { sentryProject, posthogProjectId };
}
