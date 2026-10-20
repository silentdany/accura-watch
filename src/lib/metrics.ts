import type { HealthCheck, Insight, Site, SyncState } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { addDays, parseYmd, utcDay, ymd, type Range } from "@/lib/dates";
import { pctChange } from "@/lib/format";
import { RETIRED_SOURCES } from "@/lib/collect/collectors";
import { DAILY_REFERRER_PREFIX } from "@/lib/collect/store";
import { splitOrigins } from "@/lib/origins";

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
  organicEtvPrev: number | null;
  organicTop10: number | null;
  opr: number | null;
  ahrefsDr: number | null;
  ahrefsDrPrev: number | null;
  collectedAt: string | null;
  /** Carried forward over the selected range: a day with no measurement keeps the previous value. */
  keywordsSeries: Series;
  referringSeries: Series;
  etvSeries: Series;
};

export type SyncInfo = { source: string; ok: boolean; error: string | null; lastRunAt: string; lastSuccessAt: string | null };

/** Sources shown in the "how fresh is this?" line, in display order. */
export const FRESHNESS_SOURCES = ["gsc", "posthog", "sentry", "health"] as const;
export type FreshnessSource = (typeof FRESHNESS_SOURCES)[number];

/**
 * When a source was last collected *successfully*. `at` is the oldest success across the
 * sites it covers (the honest number: one stale site makes the whole figure stale), null when
 * some site was never collected. `ok` is false when the latest attempt failed.
 */
export type Freshness = { source: FreshnessSource; at: string | null; ok: boolean };

export function computeFreshness(states: { source: string; ok: boolean; lastSuccessAt: Date | string | null }[]): Freshness[] {
  const out: Freshness[] = [];
  for (const source of FRESHNESS_SOURCES) {
    const list = states.filter((s) => s.source === source);
    if (!list.length) continue;
    const times = list.map((s) => (s.lastSuccessAt ? new Date(s.lastSuccessAt).getTime() : null));
    const oldest = times.includes(null) ? null : Math.min(...(times as number[]));
    out.push({ source, at: oldest == null ? null : new Date(oldest).toISOString(), ok: list.every((s) => s.ok) });
  }
  return out;
}

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

/** One chart day on the home page: who carried the visitors, and where those visitors came from. */
export type DayOrigin = {
  date: string;
  /** Site with the most visitors that day. Null when every site was at zero. */
  site: string | null;
  siteSlug: string | null;
  google: number;
  direct: number;
  other: number;
  /** False when that day's referrers were not stored for the lead site. Treat google/direct/other as unknown. */
  measured: boolean;
  /** Lead site's Search Console clicks. Null outside its Search Console window (a missing day is not zero). */
  clicks: number | null;
};

export type LinkYieldSite = { name: string; slug: string; clicksPerDomain: number };

/** Google clicks over the selected range, divided by the latest referring-domain count. */
export type LinkYield = {
  best: LinkYieldSite;
  /** Another site with a strictly lower ratio. Null when only one site qualifies, or they all tie. */
  worst: LinkYieldSite | null;
  sites: number;
};

export type SeoMove = {
  name: string;
  slug: string;
  keywords: { from: number; to: number } | null;
  referringDomains: { from: number; to: number } | null;
};

/** What moved between the last two SEO readings. `comparable` is false until two readings exist. */
export type SeoChanges = {
  comparable: boolean;
  moved: SeoMove[];
};

export type Overview = {
  range: Range;
  generatedAt: string;
  /** Newest run of ANY collector (uptime runs every few minutes): not a freshness signal, see `freshness`. */
  lastSync: string | null;
  /** Last successful collection per source, so differently aged numbers don't look equally fresh. */
  freshness: Freshness[];
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
    keywords: number | null;
    keywordsPrev: number | null;
    referringDomains: number | null;
    referringDomainsPrev: number | null;
    estimated: number | null;
    estimatedPrev: number | null;
    keywordsSeries: Series;
    referringSeries: Series;
    etvSeries: Series;
  };
  sites: SiteRow[];
  alerts: Alert[];
  /** Aligned with the home chart: visitor dates when any site has PostHog, otherwise Search Console dates. */
  dayMix: DayOrigin[];
  linkYield: LinkYield | null;
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

function mergedMetric(
  get: (siteId: string, source: string, key: string) => Map<string, number> | null,
  siteId: string,
  keys: string[],
): Map<string, number> | null {
  const out = new Map<string, number>();
  for (const key of keys) {
    const m = get(siteId, "seo", key);
    if (!m) continue;
    for (const [d, v] of m) if (!out.has(d)) out.set(d, v);
  }
  return out.size ? out : null;
}

/** Last known value repeated until the next measurement. Days before the first point are NaN. */
function carryForward(m: Map<string, number> | null, dates: string[]): number[] {
  if (!m || !m.size) return dates.map(() => NaN);
  const sorted = [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  let idx = 0;
  let last = NaN;
  return dates.map((d) => {
    while (idx < sorted.length && sorted[idx][0] <= d) {
      last = sorted[idx][1];
      idx += 1;
    }
    return last;
  });
}

const RETIRED = new Set<string>(RETIRED_SOURCES);

/** Hide retired DataForSEO collectors, and drop DataForSEO text from a remaining error. */
export function presentSync(rows: SyncInfo[]): SyncInfo[] {
  return rows.flatMap((s) => {
    if (RETIRED.has(s.source)) return [];
    if (!s.error || !/dataforseo/i.test(s.error)) return [s];
    const parts = s.error
      .split(/\s*·\s*/)
      .map((p) => p.trim())
      .filter((p) => p && !/dataforseo/i.test(p));
    if (!parts.length) return [{ ...s, ok: true, error: null }];
    return [{ ...s, error: parts.join(" · ") }];
  });
}

function withoutDataForSeo(detail: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!detail || !Array.isArray(detail.errors)) return detail;
  return { ...detail, errors: detail.errors.filter((e) => typeof e !== "string" || !/dataforseo/i.test(e)) };
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
        organicEtvPrev: latestTwo(get(site.id, "seo", "organic_etv"))[1],
        organicTop10: latestTwo(get(site.id, "seo", "organic_top10"))[0],
        opr: latestTwo(get(site.id, "seo", "opr"))[0],
        ahrefsDr: latestTwo(get(site.id, "seo", "ahrefs_dr"))[0],
        ahrefsDrPrev: latestTwo(get(site.id, "seo", "ahrefs_dr"))[1],
        collectedAt: seoSummary.collectedAt ?? null,
        keywordsSeries: { dates: recentDays, values: carryForward(mergedMetric(get, site.id, ["organic_keywords", "monthly_keywords"]), recentDays) },
        referringSeries: { dates: recentDays, values: carryForward(get(site.id, "seo", "referring_domains"), recentDays) },
        etvSeries: { dates: recentDays, values: carryForward(mergedMetric(get, site.id, ["organic_etv", "monthly_etv"]), recentDays) },
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
      sync: presentSync(
        states
          .filter((s) => s.siteId === site.id)
          .map((s) => ({ source: s.source, ok: s.ok, error: s.error, lastRunAt: s.lastRunAt.toISOString(), lastSuccessAt: s.lastSuccessAt?.toISOString() ?? null })),
      ),
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
      where: {
        siteId: { in: siteIds },
        source: { in: ["gsc", "posthog", "sentry"] },
        date: { gte: since },
        NOT: { key: { startsWith: DAILY_REFERRER_PREFIX } },
      },
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

function sumNullable(rows: SiteRow[], pick: (s: SeoSummary) => number | null): number | null {
  let sum = 0;
  let any = false;
  for (const r of rows) {
    if (!r.seo) continue;
    const v = pick(r.seo);
    if (v != null && Number.isFinite(v)) {
      sum += v;
      any = true;
    }
  }
  return any ? sum : null;
}

function sumCarried(rows: SiteRow[], key: "keywordsSeries" | "referringSeries" | "etvSeries", dates: string[]): Series {
  return {
    dates,
    values: dates.map((_, i) => {
      let sum = 0;
      let any = false;
      for (const r of rows) {
        const v = r.seo?.[key].values[i];
        if (v != null && Number.isFinite(v)) {
          sum += v;
          any = true;
        }
      }
      return any ? sum : NaN;
    }),
  };
}

function seoTotals(rows: SiteRow[], range: Range) {
  const dates = dayList(utcDay(), range);
  return {
    keywords: sumNullable(rows, (s) => s.organicKeywords),
    keywordsPrev: sumNullable(rows, (s) => s.organicKeywordsPrev),
    referringDomains: sumNullable(rows, (s) => s.referringDomains),
    referringDomainsPrev: sumNullable(rows, (s) => s.referringDomainsPrev),
    estimated: sumNullable(rows, (s) => s.organicEtv),
    estimatedPrev: sumNullable(rows, (s) => s.organicEtvPrev),
    keywordsSeries: sumCarried(rows, "keywordsSeries", dates),
    referringSeries: sumCarried(rows, "referringSeries", dates),
    etvSeries: sumCarried(rows, "etvSeries", dates),
  };
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
  const chartDates = rows.some((r) => r.posthog) ? dayList(utcDay(), range) : gscDates;
  const dayMix = await dayMixFor(rows, chartDates);

  return {
    range,
    generatedAt: new Date().toISOString(),
    lastSync: lastSync?.toISOString() ?? null,
    freshness: computeFreshness(data.states),
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
      ...seoTotals(rows, range),
    },
    sites: rows,
    alerts: computeAlerts(rows),
    dayMix,
    linkYield: linkYieldOf(rows),
  };
}

/** Health checks run about every 4 minutes. One failed check stands for that slice of the day. */
const HEALTH_SLICE_MINUTES = 4;

function downMinutesFor(checks: { checkedAt: Date; ok: boolean }[], dates: string[]): (number | null)[] {
  const failed = new Map<string, number>();
  for (const check of checks) {
    if (check.ok) continue;
    const day = ymd(check.checkedAt);
    failed.set(day, (failed.get(day) ?? 0) + 1);
  }
  return dates.map((day) => {
    const n = failed.get(day) ?? 0;
    return n > 0 ? n * HEALTH_SLICE_MINUTES : null;
  });
}

function clicksOnDay(row: SiteRow, date: string): number | null {
  if (!row.gsc) return null;
  const dates = row.gsc.clicksSeries.dates;
  if (!dates.length || date < dates[0] || date > dates[dates.length - 1]) return null;
  const i = dates.indexOf(date);
  return i >= 0 ? (row.gsc.clicksSeries.values[i] ?? 0) : null;
}

async function dayMixFor(rows: SiteRow[], dates: string[]): Promise<DayOrigin[]> {
  if (!dates.length) return [];
  const watched = rows.filter((row) => row.posthog);
  const metrics = watched.length
    ? await prisma.dailyMetric.findMany({
        where: {
          siteId: { in: watched.map((row) => row.id) },
          source: "posthog",
          key: { startsWith: DAILY_REFERRER_PREFIX },
          date: { gte: parseYmd(dates[0]), lte: parseYmd(dates[dates.length - 1]) },
        },
        select: { siteId: true, key: true, date: true, value: true },
      })
    : [];
  const bySiteDate = new Map<string, { key: string; visitors: number }[]>();
  for (const row of metrics) {
    const key = `${row.siteId}|${ymd(row.date)}`;
    const list = bySiteDate.get(key) ?? [];
    list.push({ key: row.key.slice(DAILY_REFERRER_PREFIX.length), visitors: row.value });
    bySiteDate.set(key, list);
  }
  return dates.map((date) => {
    let lead: SiteRow | null = null;
    let leadVisitors = -1;
    for (const row of watched) {
      const series = row.posthog!.visitorsSeries;
      const i = series.dates.indexOf(date);
      const visitors = i >= 0 ? (series.values[i] ?? 0) : 0;
      if (visitors > leadVisitors) {
        lead = row;
        leadVisitors = visitors;
      }
    }
    if (!lead || leadVisitors <= 0) {
      return { date, site: null, siteSlug: null, google: 0, direct: 0, other: 0, measured: false, clicks: null };
    }
    const refs = bySiteDate.get(`${lead.id}|${date}`);
    const origins = refs?.length ? splitOrigins(refs) : { google: 0, direct: 0, other: 0 };
    return { date, site: lead.name, siteSlug: lead.slug, ...origins, measured: !!refs?.length, clicks: clicksOnDay(lead, date) };
  });
}

function linkYieldOf(rows: SiteRow[]): LinkYield | null {
  const scored = rows
    .filter((row) => row.gsc && (row.seo?.referringDomains ?? 0) > 0)
    .map((row) => ({
      name: row.name,
      slug: row.slug,
      clicksPerDomain: row.gsc!.clicks / row.seo!.referringDomains!,
    }))
    .sort((a, b) => b.clicksPerDomain - a.clicksPerDomain || a.name.localeCompare(b.name));
  if (!scored.length) return null;
  const best = scored[0];
  const last = scored[scored.length - 1];
  return { best, worst: scored.length >= 2 && last.clicksPerDomain < best.clicksPerDomain ? last : null, sites: scored.length };
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
  /** Top referring domains per day, aligned with `posthog.visitorsSeries.dates`. Empty until that day is collected. */
  posthogReferrersByDay: { key: string; visitors: number }[][] | null;
  sentryIssues: SentryIssueRow[] | null;
  seoDetail: Record<string, unknown> | null;
  latency: Series;
  /** Minutes offline on each visitor-chart day. Null when the site has no visitor series. A null day had no failed check. */
  downMinutes: (number | null)[] | null;
  alerts: Alert[];
};

function referrersAligned(rows: MetricRow[], siteId: string, dates: string[]): { key: string; visitors: number }[][] {
  const byDate = new Map<string, { key: string; visitors: number }[]>();
  for (const row of rows) {
    if (row.siteId !== siteId || row.source !== "posthog" || !row.key.startsWith(DAILY_REFERRER_PREFIX)) continue;
    const date = ymd(row.date);
    const list = byDate.get(date) ?? [];
    list.push({ key: row.key.slice(DAILY_REFERRER_PREFIX.length), visitors: row.value });
    byDate.set(date, list);
  }
  for (const list of byDate.values()) list.sort((a, b) => b.visitors - a.visitors || a.key.localeCompare(b.key));
  return dates.map((d) => byDate.get(d) ?? []);
}

export async function loadSiteReport(site: Site, range: Range): Promise<SiteReport> {
  const [data, referrerMetrics] = await Promise.all([
    loadData([site], range),
    prisma.dailyMetric.findMany({
      where: {
        siteId: site.id,
        source: "posthog",
        key: { startsWith: DAILY_REFERRER_PREFIX },
        date: { gte: addDays(utcDay(), -range) },
      },
      select: { siteId: true, source: true, key: true, date: true, value: true },
    }),
  ]);
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
    posthogReferrersByDay: row.posthog ? referrersAligned(referrerMetrics, site.id, row.posthog.visitorsSeries.dates) : null,
    sentryIssues: ins<{ issues: SentryIssueRow[] }>("sentry", "issues")?.issues ?? null,
    seoDetail: withoutDataForSeo(ins<Record<string, unknown>>("seo", "summary")),
    latency,
    downMinutes: row.posthog ? downMinutesFor(data.checks, row.posthog.visitorsSeries.dates) : null,
    alerts: computeAlerts([row]),
  };
}

function pairIfMoved(points: { value: number }[]): { from: number; to: number } | null {
  if (points.length < 2) return null;
  const from = points[points.length - 2].value;
  const to = points[points.length - 1].value;
  return from === to ? null : { from, to };
}

/** Latest two organic-keyword and referring-domain readings per active site. Skips a full overview load. */
export async function seoDeltas(): Promise<SeoChanges> {
  const sites = await prisma.site.findMany({
    where: { active: true },
    select: { id: true, name: true, slug: true },
    orderBy: { name: "asc" },
  });
  if (!sites.length) return { comparable: false, moved: [] };
  const rows = await prisma.dailyMetric.findMany({
    where: {
      siteId: { in: sites.map((site) => site.id) },
      source: "seo",
      key: { in: ["organic_keywords", "referring_domains"] },
    },
    select: { siteId: true, key: true, date: true, value: true },
    orderBy: { date: "asc" },
  });
  const bySite = new Map<string, { keywords: { value: number }[]; referring: { value: number }[] }>();
  for (const row of rows) {
    const bucket = bySite.get(row.siteId) ?? { keywords: [], referring: [] };
    if (row.key === "organic_keywords") bucket.keywords.push({ value: row.value });
    else bucket.referring.push({ value: row.value });
    bySite.set(row.siteId, bucket);
  }
  let comparable = false;
  const moved: SeoMove[] = [];
  for (const site of sites) {
    const bucket = bySite.get(site.id) ?? { keywords: [], referring: [] };
    if (bucket.keywords.length >= 2 || bucket.referring.length >= 2) comparable = true;
    const keywords = pairIfMoved(bucket.keywords);
    const referringDomains = pairIfMoved(bucket.referring);
    if (keywords || referringDomains) moved.push({ name: site.name, slug: site.slug, keywords, referringDomains });
  }
  return { comparable, moved };
}
