import type { HealthCheck, Insight, Site, SyncState } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { addDays, utcDay, ymd, type Range } from "@/lib/dates";
import { pctChange } from "@/lib/format";

// ─── Types ──────────────────────────────────────────────────────────────────

export type Series = { dates: string[]; values: number[] };

export type GscSummary = {
  clicks: number;
  clicksPrev: number;
  impressions: number;
  impressionsPrev: number;
  ctr: number;
  ctrPrev: number;
  position: number | null;
  positionPrev: number | null;
  endDate: string;
  clicksSeries: Series;
  impressionsSeries: Series;
  positionSeries: Series;
};

export type PosthogSummary = {
  visitors: number;
  visitorsPrev: number;
  pageviews: number;
  pageviewsPrev: number;
  visitorsSeries: Series;
  pageviewsSeries: Series;
};

export type SentrySummary = {
  unresolved: number;
  events: number;
  eventsPrev: number;
  eventsSeries: Series;
};

export type HealthSummary = {
  status: "up" | "down" | "unknown";
  latencyMs: number | null;
  statusCode: number | null;
  uptime: number | null; // 0..1 over the selected range
  sslDaysLeft: number | null;
  lastCheckedAt: string | null;
  error: string | null;
};

export type SeoSummary = {
  rank: number | null;
  rankPrev: number | null;
  referringDomains: number | null;
  referringDomainsPrev: number | null;
  backlinks: number | null;
  organicKeywords: number | null;
  organicKeywordsPrev: number | null;
  organicEtv: number | null;
  organicTop10: number | null;
  opr: number | null;
  ahrefsDr: number | null;
  ahrefsDrPrev: number | null;
  collectedAt: string | null;
};

export type SyncInfo = { source: string; ok: boolean; error: string | null; lastRunAt: string };

export type SiteRow = {
  id: string;
  slug: string;
  name: string;
  domain: string;
  url: string;
  pinned: boolean;
  mapped: { gsc: boolean; posthog: boolean; sentry: boolean };
  health: HealthSummary;
  gsc: GscSummary | null;
  posthog: PosthogSummary | null;
  sentry: SentrySummary | null;
  seo: SeoSummary | null;
  sync: SyncInfo[];
};

export type AlertKind = "down" | "tls" | "uptime" | "clicksDrop" | "visitorsDrop" | "errorSpike" | "syncFailing";

export type Alert = {
  severity: "critical" | "warning" | "info";
  kind: AlertKind;
  site: string;
  siteName: string;
  domain: string;
  source: string;
  /** English message (MCP / API). The UI phrases `kind` + `data` in the user's language. */
  message: string;
  data: { error?: string | null; days?: number; ratio?: number; change?: number; factor?: number | null; count?: number };
};

export type Overview = {
  range: Range;
  generatedAt: string;
  lastSync: string | null;
  totals: {
    sites: number;
    up: number;
    down: number;
    clicks: number;
    clicksPrev: number;
    impressions: number;
    impressionsPrev: number;
    ctr: number;
    ctrPrev: number;
    position: number | null;
    positionPrev: number | null;
    visitors: number;
    visitorsPrev: number;
    unresolved: number;
    events: number;
    eventsPrev: number;
    clicksSeries: Series;
    visitorsSeries: Series;
  };
  sites: SiteRow[];
  alerts: Alert[];
};

// ─── Helpers ────────────────────────────────────────────────────────────────

type MetricRow = { siteId: string; source: string; key: string; date: Date; value: number };

function dayList(end: Date, days: number): string[] {
  return Array.from({ length: days }, (_, i) => ymd(addDays(end, i - days + 1)));
}

function indexMetrics(rows: MetricRow[]) {
  const map = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const k = `${r.siteId}|${r.source}|${r.key}`;
    let m = map.get(k);
    if (!m) map.set(k, (m = new Map()));
    m.set(ymd(r.date), r.value);
  }
  return (siteId: string, source: string, key: string) => map.get(`${siteId}|${source}|${key}`) ?? null;
}

const sumOver = (m: Map<string, number> | null, days: string[]) =>
  days.reduce((acc, d) => acc + (m?.get(d) ?? 0), 0);

function weightedPosition(
  pos: Map<string, number> | null,
  imp: Map<string, number> | null,
  days: string[],
): number | null {
  let w = 0;
  let s = 0;
  for (const d of days) {
    const i = imp?.get(d) ?? 0;
    const p = pos?.get(d);
    if (i > 0 && p != null) {
      w += i;
      s += p * i;
    }
  }
  return w > 0 ? s / w : null;
}

function latestTwo(m: Map<string, number> | null): [number | null, number | null] {
  if (!m || !m.size) return [null, null];
  const keys = [...m.keys()].sort();
  return [m.get(keys[keys.length - 1]) ?? null, keys.length > 1 ? (m.get(keys[keys.length - 2]) ?? null) : null];
}

function lastDate(m: Map<string, number> | null): string | null {
  if (!m || !m.size) return null;
  return [...m.keys()].sort().pop() ?? null;
}

function insightData<T>(insights: Insight[], siteId: string, source: string, kind: string): T | null {
  return (insights.find((i) => i.siteId === siteId && i.source === source && i.kind === kind)?.data as T) ?? null;
}


// ─── Build rows ─────────────────────────────────────────────────────────────

type BuildInput = {
  sites: Site[];
  range: Range;
  metrics: MetricRow[];
  insights: Insight[];
  checks: Pick<HealthCheck, "siteId" | "checkedAt" | "ok" | "latencyMs" | "statusCode" | "sslExpiresAt" | "error">[];
  states: SyncState[];
};

function buildRows({ sites, range, metrics, insights, checks, states }: BuildInput): SiteRow[] {
  const get = indexMetrics(metrics);
  const today = utcDay();
  const recentDays = dayList(today, range);
  const recentPrev = dayList(addDays(today, -range), range);
  const rangeStart = addDays(new Date(), -range);

  return sites.map((site) => {
    // GSC — window ends at the latest day with data (Search Console lags ~2 days)
    let gsc: GscSummary | null = null;
    const clicksM = get(site.id, "gsc", "clicks");
    const impM = get(site.id, "gsc", "impressions");
    const posM = get(site.id, "gsc", "position");
    const gscEnd = lastDate(clicksM);
    if (site.gscProperty && gscEnd) {
      const end = new Date(`${gscEnd}T00:00:00Z`);
      const cur = dayList(end, range);
      const prev = dayList(addDays(end, -range), range);
      const clicks = sumOver(clicksM, cur);
      const clicksPrev = sumOver(clicksM, prev);
      const impressions = sumOver(impM, cur);
      const impressionsPrev = sumOver(impM, prev);
      gsc = {
        clicks,
        clicksPrev,
        impressions,
        impressionsPrev,
        ctr: impressions ? clicks / impressions : 0,
        ctrPrev: impressionsPrev ? clicksPrev / impressionsPrev : 0,
        position: weightedPosition(posM, impM, cur),
        positionPrev: weightedPosition(posM, impM, prev),
        endDate: gscEnd,
        clicksSeries: { dates: cur, values: cur.map((d) => clicksM?.get(d) ?? 0) },
        impressionsSeries: { dates: cur, values: cur.map((d) => impM?.get(d) ?? 0) },
        positionSeries: { dates: cur, values: cur.map((d) => posM?.get(d) ?? NaN) },
      };
    }

    // PostHog — period uniques come from the collector summary (daily uniques don't add up)
    let posthog: PosthogSummary | null = null;
    const visM = get(site.id, "posthog", "visitors");
    const pvM = get(site.id, "posthog", "pageviews");
    const phSummary = insightData<Record<string, { visitors: number; visitorsPrev: number; pageviews: number; pageviewsPrev: number }>>(
      insights,
      site.id,
      "posthog",
      "summary",
    );
    if (site.posthogProjectId && (phSummary || visM)) {
      const p = phSummary?.[String(range)];
      posthog = {
        visitors: p?.visitors ?? sumOver(visM, recentDays),
        visitorsPrev: p?.visitorsPrev ?? sumOver(visM, recentPrev),
        pageviews: p?.pageviews ?? sumOver(pvM, recentDays),
        pageviewsPrev: p?.pageviewsPrev ?? sumOver(pvM, recentPrev),
        visitorsSeries: { dates: recentDays, values: recentDays.map((d) => visM?.get(d) ?? 0) },
        pageviewsSeries: { dates: recentDays, values: recentDays.map((d) => pvM?.get(d) ?? 0) },
      };
    }

    // Sentry
    let sentry: SentrySummary | null = null;
    const evM = get(site.id, "sentry", "events");
    const issues = insightData<{ total: number }>(insights, site.id, "sentry", "issues");
    if (site.sentryProject && (issues || evM)) {
      sentry = {
        unresolved: issues?.total ?? 0,
        events: sumOver(evM, recentDays),
        eventsPrev: sumOver(evM, recentPrev),
        eventsSeries: { dates: recentDays, values: recentDays.map((d) => evM?.get(d) ?? 0) },
      };
    }

    // SEO
    let seo: SeoSummary | null = null;
    const seoSummary = insightData<{ collectedAt?: string }>(insights, site.id, "seo", "summary");
    if (seoSummary) {
      const [rank, rankPrev] = latestTwo(get(site.id, "seo", "rank"));
      const [rd, rdPrev] = latestTwo(get(site.id, "seo", "referring_domains"));
      const [kw, kwPrev] = latestTwo(get(site.id, "seo", "organic_keywords"));
      seo = {
        rank,
        rankPrev,
        referringDomains: rd,
        referringDomainsPrev: rdPrev,
        backlinks: latestTwo(get(site.id, "seo", "backlinks"))[0],
        organicKeywords: kw,
        organicKeywordsPrev: kwPrev,
        organicEtv: latestTwo(get(site.id, "seo", "organic_etv"))[0],
        organicTop10: latestTwo(get(site.id, "seo", "organic_top10"))[0],
        opr: latestTwo(get(site.id, "seo", "opr"))[0],
        ahrefsDr: latestTwo(get(site.id, "seo", "ahrefs_dr"))[0],
        ahrefsDrPrev: latestTwo(get(site.id, "seo", "ahrefs_dr"))[1],
        collectedAt: seoSummary.collectedAt ?? null,
      };
    }

    // Health
    const siteChecks = checks.filter((c) => c.siteId === site.id); // sorted desc
    const last = siteChecks[0];
    const inRange = siteChecks.filter((c) => c.checkedAt >= rangeStart);
    const ssl = siteChecks.find((c) => c.sslExpiresAt)?.sslExpiresAt ?? null;
    const health: HealthSummary = {
      status: !last ? "unknown" : last.ok ? "up" : "down",
      latencyMs: last?.latencyMs ?? null,
      statusCode: last?.statusCode ?? null,
      uptime: inRange.length ? inRange.filter((c) => c.ok).length / inRange.length : null,
      sslDaysLeft: ssl ? Math.floor((ssl.getTime() - Date.now()) / 86_400_000) : null,
      lastCheckedAt: last?.checkedAt.toISOString() ?? null,
      error: last && !last.ok ? last.error : null,
    };

    return {
      id: site.id,
      slug: site.slug,
      name: site.name,
      domain: site.domain,
      url: site.url,
      pinned: site.pinned,
      mapped: { gsc: !!site.gscProperty, posthog: !!site.posthogProjectId, sentry: !!site.sentryProject },
      health,
      gsc,
      posthog,
      sentry,
      seo,
      sync: states
        .filter((s) => s.siteId === site.id)
        .map((s) => ({ source: s.source, ok: s.ok, error: s.error, lastRunAt: s.lastRunAt.toISOString() })),
    };
  });
}

// ─── Alerts ─────────────────────────────────────────────────────────────────

export function computeAlerts(rows: SiteRow[]): Alert[] {
  const out: Alert[] = [];
  for (const r of rows) {
    const push = (severity: Alert["severity"], kind: AlertKind, source: string, message: string, data: Alert["data"] = {}) =>
      out.push({ severity, kind, site: r.slug, siteName: r.name, domain: r.domain, source, message, data });

    if (r.health.status === "down") push("critical", "down", "health", `Site down${r.health.error ? ` — ${r.health.error}` : ""}`, { error: r.health.error });
    if (r.health.sslDaysLeft != null && r.health.sslDaysLeft < 14) {
      push(r.health.sslDaysLeft < 3 ? "critical" : "warning", "tls", "health", `TLS certificate expires in ${r.health.sslDaysLeft} days`, {
        days: r.health.sslDaysLeft,
      });
    }
    if (r.health.uptime != null && r.health.uptime < 0.99 && r.health.status !== "down") {
      push("warning", "uptime", "health", `Uptime ${(r.health.uptime * 100).toFixed(1)}% over the period`, { ratio: r.health.uptime });
    }
    if (r.gsc && r.gsc.clicksPrev >= 50) {
      const d = pctChange(r.gsc.clicks, r.gsc.clicksPrev);
      if (d != null && d <= -0.3) push("warning", "clicksDrop", "gsc", `Search clicks ${Math.round(d * 100)}% vs previous period`, { change: d });
    }
    if (r.posthog && r.posthog.visitorsPrev >= 100) {
      const d = pctChange(r.posthog.visitors, r.posthog.visitorsPrev);
      if (d != null && d <= -0.4) push("warning", "visitorsDrop", "posthog", `Visitors ${Math.round(d * 100)}% vs previous period`, { change: d });
    }
    if (r.sentry && r.sentry.events >= 20 && r.sentry.events > r.sentry.eventsPrev * 3) {
      const factor = r.sentry.eventsPrev ? r.sentry.events / r.sentry.eventsPrev : null;
      push("warning", "errorSpike", "sentry", `Error events ×${factor ? factor.toFixed(1) : "∞"} (${r.sentry.events})`, {
        factor,
        count: r.sentry.events,
      });
    }
    for (const s of r.sync) {
      if (!s.ok && s.source !== "health") push("info", "syncFailing", s.source, `Sync failing: ${s.error ?? "unknown error"}`, { error: s.error });
    }
  }
  const rank = { critical: 0, warning: 1, info: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

// ─── Loaders ────────────────────────────────────────────────────────────────

async function loadData(sites: Site[], range: Range) {
  const siteIds = sites.map((s) => s.id);
  const since = addDays(utcDay(), -(range * 2 + 10));
  const [metrics, seoMetrics, insights, checks, states] = await Promise.all([
    prisma.dailyMetric.findMany({
      where: { siteId: { in: siteIds }, source: { in: ["gsc", "posthog", "sentry"] }, date: { gte: since } },
      select: { siteId: true, source: true, key: true, date: true, value: true },
    }),
    prisma.dailyMetric.findMany({
      where: { siteId: { in: siteIds }, source: "seo", date: { gte: addDays(utcDay(), -400) } },
      select: { siteId: true, source: true, key: true, date: true, value: true },
    }),
    prisma.insight.findMany({
      where: {
        siteId: { in: siteIds },
        OR: [
          { source: "posthog", kind: "summary" },
          { source: "sentry", kind: "issues" },
          { source: "seo", kind: "summary" },
        ],
      },
    }),
    prisma.healthCheck.findMany({
      where: { siteId: { in: siteIds }, checkedAt: { gte: addDays(new Date(), -Math.max(range, 30)) } },
      orderBy: { checkedAt: "desc" },
      select: { siteId: true, checkedAt: true, ok: true, latencyMs: true, statusCode: true, sslExpiresAt: true, error: true },
    }),
    prisma.syncState.findMany({ where: { siteId: { in: siteIds } } }),
  ]);
  return { metrics: [...metrics, ...seoMetrics], insights, checks, states };
}

function sumSeries(list: (Series | undefined)[], dates: string[]): Series {
  const values = dates.map(() => 0);
  for (const s of list) {
    if (!s) continue;
    s.dates.forEach((d, i) => {
      const idx = dates.indexOf(d);
      if (idx >= 0) values[idx] += s.values[i] || 0;
    });
  }
  return { dates, values };
}

export async function loadOverview(range: Range, opts: { includeInactive?: boolean } = {}): Promise<Overview> {
  const sites = await prisma.site.findMany({
    where: opts.includeInactive ? {} : { active: true },
    orderBy: [{ pinned: "desc" }, { name: "asc" }],
  });
  const data = await loadData(sites, range);
  const rows = buildRows({ sites, range, ...data });

  const gscRows = rows.filter((r) => r.gsc);
  const sum = (f: (r: SiteRow) => number | undefined) => rows.reduce((a, r) => a + (f(r) ?? 0), 0);
  const clicks = sum((r) => r.gsc?.clicks);
  const clicksPrev = sum((r) => r.gsc?.clicksPrev);
  const impressions = sum((r) => r.gsc?.impressions);
  const impressionsPrev = sum((r) => r.gsc?.impressionsPrev);
  const wpos = (cur: boolean) => {
    let w = 0;
    let s = 0;
    for (const r of gscRows) {
      const p = cur ? r.gsc!.position : r.gsc!.positionPrev;
      const i = cur ? r.gsc!.impressions : r.gsc!.impressionsPrev;
      if (p != null && i > 0) {
        w += i;
        s += p * i;
      }
    }
    return w ? s / w : null;
  };
  const gscDates = gscRows.length
    ? dayList(new Date(`${gscRows.map((r) => r.gsc!.endDate).sort().pop()}T00:00:00Z`), range)
    : dayList(addDays(utcDay(), -2), range);
  const lastSync = data.states.reduce<Date | null>((a, s) => (!a || s.lastRunAt > a ? s.lastRunAt : a), null);

  return {
    range,
    generatedAt: new Date().toISOString(),
    lastSync: lastSync?.toISOString() ?? null,
    totals: {
      sites: rows.length,
      up: rows.filter((r) => r.health.status === "up").length,
      down: rows.filter((r) => r.health.status === "down").length,
      clicks,
      clicksPrev,
      impressions,
      impressionsPrev,
      ctr: impressions ? clicks / impressions : 0,
      ctrPrev: impressionsPrev ? clicksPrev / impressionsPrev : 0,
      position: wpos(true),
      positionPrev: wpos(false),
      visitors: sum((r) => r.posthog?.visitors),
      visitorsPrev: sum((r) => r.posthog?.visitorsPrev),
      unresolved: sum((r) => r.sentry?.unresolved),
      events: sum((r) => r.sentry?.events),
      eventsPrev: sum((r) => r.sentry?.eventsPrev),
      clicksSeries: sumSeries(gscRows.map((r) => r.gsc?.clicksSeries), gscDates),
      visitorsSeries: sumSeries(rows.map((r) => r.posthog?.visitorsSeries), dayList(utcDay(), range)),
    },
    sites: rows,
    alerts: computeAlerts(rows),
  };
}

// ─── Site report ────────────────────────────────────────────────────────────

export type TopQueryRow = { key: string; clicks: number; impressions: number; ctr: number; position: number; prevClicks: number | null; prevPosition: number | null };
export type SentryIssueRow = { id: string; shortId: string; title: string; culprit: string | null; level: string; count: number; userCount: number; lastSeen: string; permalink: string };

export type SiteReport = SiteRow & {
  config: { gscProperty: string | null; posthogProjectId: string | null; posthogHost: string | null; sentryProject: string | null; active: boolean };
  range: Range;
  gscTopQueries: { startDate: string; endDate: string; rows: TopQueryRow[] } | null;
  gscTopPages: { startDate: string; endDate: string; rows: TopQueryRow[] } | null;
  posthogTopPages: { key: string; pageviews: number; visitors: number }[] | null;
  posthogReferrers: { key: string; visitors: number }[] | null;
  sentryIssues: SentryIssueRow[] | null;
  seoDetail: Record<string, unknown> | null;
  latency: Series;
  alerts: Alert[];
};

export async function loadSiteReport(site: Site, range: Range): Promise<SiteReport> {
  const data = await loadData([site], range);
  const [row] = buildRows({ sites: [site], range, ...data });
  const insights = await prisma.insight.findMany({ where: { siteId: site.id } });
  const ins = <T,>(source: string, kind: string) => insightData<T>(insights, site.id, source, kind);

  // Hourly latency points over the range (checks are desc → reverse)
  const since = addDays(new Date(), -range);
  const checks = data.checks.filter((c) => c.checkedAt >= since).reverse();
  // Bucket to ≤ 168 points (hourly for 7d, coarser beyond); a failed check in a bucket shows as a gap.
  const size = Math.max(1, Math.ceil(checks.length / 168));
  const latency: Series = { dates: [], values: [] };
  for (let i = 0; i < checks.length; i += size) {
    const b = checks.slice(i, i + size);
    const ok = b.filter((c) => c.ok && c.latencyMs != null);
    latency.dates.push(b[0].checkedAt.toISOString());
    latency.values.push(ok.length === b.length ? ok.reduce((a, c) => a + c.latencyMs!, 0) / ok.length : NaN);
  }

  return {
    ...row,
    config: {
      gscProperty: site.gscProperty,
      posthogProjectId: site.posthogProjectId,
      posthogHost: site.posthogHost,
      sentryProject: site.sentryProject,
      active: site.active,
    },
    range,
    gscTopQueries: ins("gsc", "top_queries"),
    gscTopPages: ins("gsc", "top_pages"),
    posthogTopPages: ins<{ rows: { key: string; pageviews: number; visitors: number }[] }>("posthog", "top_pages")?.rows ?? null,
    posthogReferrers: ins<{ rows: { key: string; visitors: number }[] }>("posthog", "top_referrers")?.rows ?? null,
    sentryIssues: ins<{ issues: SentryIssueRow[] }>("sentry", "issues")?.issues ?? null,
    seoDetail: ins("seo", "summary"),
    latency,
    alerts: computeAlerts([row]),
  };
}
