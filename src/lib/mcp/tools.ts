import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { addDays, parseRange, utcDay, ymd } from "@/lib/dates";
import { loadOverview, loadSiteReport } from "@/lib/metrics";
import { loadSiteInsights } from "@/lib/insights";
import {
  autoMatchSites,
  createSite,
  deleteSite,
  gscImportCandidates,
  importFromGsc,
  loadCatalogs,
  resolveSite,
  siteInput,
  siteUpdate,
  updateSite,
} from "@/lib/sites";
import { runCollection, SOURCES } from "@/lib/collect";
import { integrationStatuses } from "@/lib/integrations";
import { querySearchAnalytics } from "@/lib/providers/google";
import { runHogql } from "@/lib/providers/posthog";
import { listSentryIssues } from "@/lib/providers/sentry";
import { checkHealth } from "@/lib/providers/health";
import { fetchDomainSeo } from "@/lib/providers/seo";
import { normalizeDomain } from "@/lib/domain";

/**
 * Single tool registry, served both by the MCP server (/api/mcp) and the
 * REST API (/api/v1/tools/:name). Everything the UI can do, an agent can do.
 */

export type ToolDef = {
  name: string;
  title: string;
  description: string;
  input: z.ZodObject;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint?: boolean };
  handler: (args: Record<string, unknown>) => Promise<unknown>;
};

const rangeArg = z
  .union([z.literal(7), z.literal(28), z.literal(90)])
  .optional()
  .describe("Period in days (7, 28 or 90). Compared with the previous period of the same length. Default 28.");
const siteArg = z.string().describe("Site slug, domain or id (see list_sites)");

function tool<S extends z.ZodObject>(def: {
  name: string;
  title: string;
  description: string;
  input: S;
  annotations?: ToolDef["annotations"];
  handler: (args: z.infer<S>) => Promise<unknown>;
}): ToolDef {
  return def as unknown as ToolDef;
}

export const TOOLS: ToolDef[] = [
  tool({
    name: "get_overview",
    title: "Portfolio overview",
    description:
      "At-a-glance KPIs for every watched site: Search Console clicks/impressions/CTR/position, PostHog visitors, Sentry issues & error events, uptime/latency/TLS, domain SEO (rank, referring domains, organic keywords) — each with previous-period comparison — plus portfolio totals and active alerts. Start here.",
    input: z.object({ range: rangeArg, include_series: z.boolean().optional().describe("Include daily series (bigger output). Default false.") }),
    annotations: { readOnlyHint: true },
    async handler({ range, include_series }) {
      const o = await loadOverview(parseRange(range));
      if (include_series) return o;
      const strip = <T extends object>(obj: T | null) =>
        obj ? Object.fromEntries(Object.entries(obj).filter(([k]) => !k.endsWith("Series"))) : null;
      return {
        ...o,
        totals: strip(o.totals),
        sites: o.sites.map((s) => ({ ...s, gsc: strip(s.gsc), posthog: strip(s.posthog), sentry: strip(s.sentry) })),
      };
    },
  }),
  tool({
    name: "get_site_report",
    title: "Site report",
    description:
      "Full report for one site: KPI summary with deltas and daily series, top Search Console queries & pages (with previous-period clicks/position), PostHog top pages & referrers, top unresolved Sentry issues, uptime/latency, domain SEO detail and alerts.",
    input: z.object({ site: siteArg, range: rangeArg }),
    annotations: { readOnlyHint: true },
    async handler({ site, range }) {
      return loadSiteReport(await resolveSite(site), parseRange(range));
    },
  }),
  tool({
    name: "get_site_insights",
    title: "Site insights",
    description:
      "Cross-source stats for one site: share of visitors coming from Google search, errors per 1k visitors, DataForSEO traffic estimate vs real clicks, clicks per referring domain, detrended daily correlations with lag (impressions/position → clicks, clicks → visitors, latency → rankings/visitors, errors → visitors), queries with a CTR gap vs the typical CTR at their position, striking-distance queries (positions 11–20), per-page search share, and authority history.",
    input: z.object({ site: siteArg, range: rangeArg }),
    annotations: { readOnlyHint: true },
    async handler({ site, range }) {
      return loadSiteInsights(await resolveSite(site), parseRange(range));
    },
  }),
  tool({
    name: "get_alerts",
    title: "Alerts",
    description: "Things that need attention across all sites: downtime, expiring TLS, traffic drops, Sentry error spikes and failing data syncs.",
    input: z.object({ range: rangeArg }),
    annotations: { readOnlyHint: true },
    async handler({ range }) {
      return (await loadOverview(parseRange(range, 7))).alerts;
    },
  }),
  tool({
    name: "list_sites",
    title: "List sites",
    description: "All watched sites with their provider mappings (Search Console property, PostHog project, Sentry project) and last sync status per source.",
    input: z.object({ include_inactive: z.boolean().optional() }),
    annotations: { readOnlyHint: true },
    async handler({ include_inactive }) {
      const sites = await prisma.site.findMany({
        where: include_inactive ? {} : { active: true },
        orderBy: [{ pinned: "desc" }, { name: "asc" }],
        include: { syncStates: true },
      });
      return sites.map((s) => ({
        id: s.id,
        slug: s.slug,
        name: s.name,
        domain: s.domain,
        url: s.url,
        active: s.active,
        pinned: s.pinned,
        gscProperty: s.gscProperty,
        posthogProjectId: s.posthogProjectId,
        posthogHost: s.posthogHost,
        sentryProject: s.sentryProject,
        sync: s.syncStates.map((st) => ({ source: st.source, ok: st.ok, error: st.error, lastRunAt: st.lastRunAt })),
      }));
    },
  }),
  tool({
    name: "query_search_console",
    title: "Query Search Console",
    description:
      "Live Google Search Console Search Analytics query for a site. Use for any SEO question: queries/pages/countries/devices, date comparisons, filtering (e.g. queries containing a word, a page path). Returns clicks, impressions, ctr, position per row.",
    input: z.object({
      site: siteArg,
      start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("YYYY-MM-DD. Default: 28 days before end_date."),
      end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("YYYY-MM-DD. Default: 2 days ago."),
      dimensions: z.array(z.enum(["date", "query", "page", "country", "device", "searchAppearance"])).optional().describe('Default ["query"]'),
      filters: z
        .array(
          z.object({
            dimension: z.enum(["query", "page", "country", "device", "searchAppearance"]),
            operator: z.enum(["equals", "notEquals", "contains", "notContains", "includingRegex", "excludingRegex"]).optional(),
            expression: z.string(),
          }),
        )
        .optional(),
      search_type: z.enum(["web", "image", "video", "news", "discover", "googleNews"]).optional(),
      row_limit: z.number().int().min(1).max(25000).optional().describe("Default 100"),
    }),
    annotations: { readOnlyHint: true, openWorldHint: true },
    async handler(a) {
      const site = await resolveSite(a.site);
      if (!site.gscProperty) throw new Error(`${site.domain} has no Search Console property mapped`);
      const end = a.end_date ?? ymd(addDays(utcDay(), -2));
      const start = a.start_date ?? ymd(addDays(new Date(`${end}T00:00:00Z`), -27));
      const rows = await querySearchAnalytics(site.gscProperty, {
        startDate: start,
        endDate: end,
        dimensions: a.dimensions ?? ["query"],
        filters: a.filters,
        type: a.search_type,
        rowLimit: a.row_limit ?? 100,
      });
      return { property: site.gscProperty, startDate: start, endDate: end, rows };
    },
  }),
  tool({
    name: "list_gsc_properties",
    title: "List Search Console properties",
    description: "Search Console properties accessible with the connected Google account, and whether each is already watched.",
    input: z.object({}),
    annotations: { readOnlyHint: true, openWorldHint: true },
    async handler() {
      return gscImportCandidates();
    },
  }),
  tool({
    name: "run_hogql",
    title: "Run HogQL on PostHog",
    description:
      "Run a read-only HogQL (SQL) query against the PostHog project mapped to a site, e.g. `SELECT properties.$pathname, count() FROM events WHERE event = '$pageview' AND timestamp > now() - INTERVAL 7 DAY GROUP BY 1 ORDER BY 2 DESC LIMIT 20`. Tables: events, persons, sessions. If the site has a posthogHost filter, add `properties.$host` conditions yourself.",
    input: z.object({ site: siteArg, query: z.string().min(10) }),
    annotations: { readOnlyHint: true, openWorldHint: true },
    async handler({ site, query }) {
      const s = await resolveSite(site);
      if (!s.posthogProjectId) throw new Error(`${s.domain} has no PostHog project mapped`);
      const r = await runHogql(s.posthogProjectId, query);
      return { ...r, results: r.results.slice(0, 500), truncated: r.results.length > 500, posthogHost: s.posthogHost };
    },
  }),
  tool({
    name: "list_sentry_issues",
    title: "List Sentry issues",
    description: "Live Sentry issues for a site's project. Supports Sentry search syntax (default `is:unresolved`) and sort (freq, date, new, user).",
    input: z.object({
      site: siteArg,
      query: z.string().optional(),
      sort: z.enum(["freq", "date", "new", "user"]).optional(),
      stats_period: z.enum(["24h", "14d"]).optional(),
      limit: z.number().int().min(1).max(100).optional(),
    }),
    annotations: { readOnlyHint: true, openWorldHint: true },
    async handler(a) {
      const s = await resolveSite(a.site);
      if (!s.sentryProject) throw new Error(`${s.domain} has no Sentry project mapped`);
      return listSentryIssues(s.sentryProject, { query: a.query, sort: a.sort, statsPeriod: a.stats_period, limit: a.limit ?? 25 });
    },
  }),
  tool({
    name: "check_site_health",
    title: "Check site health now",
    description: "Live HTTP check of a site (status code, latency, TLS certificate expiry). Accepts a watched site or any URL.",
    input: z.object({ site: z.string().describe("Site slug/domain, or any https:// URL") }),
    annotations: { readOnlyHint: true, openWorldHint: true },
    async handler({ site }) {
      let url = site;
      if (!/^https?:\/\//.test(site)) url = (await resolveSite(site)).url;
      return { url, ...(await checkHealth(url)) };
    },
  }),
  tool({
    name: "get_domain_seo",
    title: "Domain SEO metrics",
    description:
      "Live Ahrefs-style metrics for ANY domain (competitors too) via DataForSEO, Open PageRank and the free Ahrefs Domain Rating: domain rank (0-100), backlinks, referring domains, organic keywords, estimated organic traffic. Costs a few cents of DataForSEO credit per call.",
    input: z.object({ domain: z.string() }),
    annotations: { readOnlyHint: true, openWorldHint: true },
    async handler({ domain }) {
      const d = normalizeDomain(domain);
      if (!d) throw new Error("Invalid domain");
      return fetchDomainSeo(d);
    },
  }),
  tool({
    name: "add_site",
    title: "Add a site",
    description: "Start watching a site. Provider mappings are auto-detected from Search Console / PostHog / Sentry when omitted.",
    input: siteInput,
    annotations: { idempotentHint: false },
    async handler(a) {
      return createSite(a);
    },
  }),
  tool({
    name: "update_site",
    title: "Update a site",
    description: "Change a site's name, URL or provider mappings, pin it, or pause it (active=false). Empty string clears a mapping.",
    input: siteUpdate.extend({ site: siteArg }),
    annotations: { idempotentHint: true },
    async handler({ site, ...patch }) {
      const s = await resolveSite(site);
      return updateSite(s.id, patch);
    },
  }),
  tool({
    name: "remove_site",
    title: "Remove a site",
    description: "Permanently delete a site and all its collected history. Prefer update_site active=false to pause.",
    input: z.object({ site: siteArg, confirm: z.literal(true) }),
    annotations: { destructiveHint: true },
    async handler({ site }) {
      const s = await resolveSite(site);
      await deleteSite(s.id);
      return { deleted: s.domain };
    },
  }),
  tool({
    name: "import_sites_from_gsc",
    title: "Import sites from Search Console",
    description: "Create sites from Search Console properties (all not-yet-watched ones by default). PostHog/Sentry projects are auto-matched by name.",
    input: z.object({
      properties: z.array(z.string()).optional().describe("Property URLs or domains to import. Omit to import all."),
      dry_run: z.boolean().optional(),
    }),
    async handler({ properties, dry_run }) {
      if (dry_run) return gscImportCandidates();
      const r = await importFromGsc(properties);
      return { created: r.created.map((s) => ({ slug: s.slug, domain: s.domain })), skipped: r.skipped };
    },
  }),
  tool({
    name: "auto_match_projects",
    title: "Auto-match provider projects",
    description: "Fill missing Search Console / PostHog / Sentry mappings on all sites by matching domains and project names. Returns catalogs so you can map the rest with update_site.",
    input: z.object({ dry_run: z.boolean().optional() }),
    async handler({ dry_run }) {
      const catalogs = await loadCatalogs();
      if (dry_run) return catalogs;
      return { fieldsSet: await autoMatchSites(), catalogs };
    },
  }),
  tool({
    name: "sync_now",
    title: "Sync data now",
    description: `Collect fresh data now (ignores cadence). Sources: ${SOURCES.join(", ")}. Omit site to sync everything (may take a minute).`,
    input: z.object({ site: z.string().optional(), sources: z.array(z.enum(["health", "gsc", "posthog", "sentry", "seo"])).optional() }),
    annotations: { openWorldHint: true },
    async handler({ site, sources }) {
      const siteIds = site ? [(await resolveSite(site)).id] : undefined;
      const r = await runCollection({ siteIds, sources, force: true });
      return { ...r, results: r.results.filter((x) => x.status !== "not_due") };
    },
  }),
  tool({
    name: "get_integrations",
    title: "Integration status",
    description: "Which data providers are connected (Google Search Console, PostHog, Sentry, DataForSEO, Open PageRank, Ahrefs). Secrets are never returned.",
    input: z.object({}),
    annotations: { readOnlyHint: true },
    async handler() {
      return (await integrationStatuses()).map(({ id, label, connected, source, detail }) => ({ id, label, connected, source, detail }));
    },
  }),
];

export function findTool(name: string): ToolDef | undefined {
  return TOOLS.find((t) => t.name === name);
}

export function toolJsonSchema(t: ToolDef): Record<string, unknown> {
  const schema = z.toJSONSchema(t.input, { io: "input" }) as Record<string, unknown>;
  delete schema.$schema;
  return schema;
}

export async function callTool(name: string, rawArgs: unknown): Promise<unknown> {
  const t = findTool(name);
  if (!t) throw new Error(`Unknown tool: ${name}`);
  const parsed = t.input.safeParse(rawArgs ?? {});
  if (!parsed.success) {
    throw new Error(`Invalid arguments: ${z.prettifyError(parsed.error)}`);
  }
  return t.handler(parsed.data as Record<string, unknown>);
}
