import type { Site } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { addDays, parseYmd, utcDay, ymd, DAY_MS } from "@/lib/dates";
import { querySearchAnalytics, type GscRow } from "@/lib/providers/google";
import { hostClause, runHogql } from "@/lib/providers/posthog";
import { listSentryIssues, sentryDailyEvents } from "@/lib/providers/sentry";
import { backlinksNewLost, competitorsAndGaps, fetchDomainSeo, keywordOverview, RANK_HISTORY_START, rankHistory } from "@/lib/providers/seo";
import { checkHealth } from "@/lib/providers/health";
import { DAILY_REFERRER_PREFIX, replacePrefixedDaily, writeDaily, writeInsight, type Point } from "./store";
import { errorMessage } from "@/lib/http";

export type Source = "health" | "gsc" | "posthog" | "sentry" | "seo" | "backlinks" | "rank_history" | "competitors" | "keywords";
export const SOURCES: Source[] = ["health", "gsc", "posthog", "sentry", "seo", "backlinks", "rank_history", "competitors", "keywords"];

export type Connected = {
  google: boolean;
  posthog: boolean;
  sentry: boolean;
  dataforseo: boolean;
  openpagerank: boolean;
  ahrefs: boolean;
  seoCadenceDays: number;
};

export type Collector = {
  source: Source;
  label: string;
  /** Minimum minutes between two runs for one site. */
  cadenceMinutes: (c: Connected) => number;
  /** null = runnable, otherwise the reason it is skipped. */
  skipReason: (site: Site, c: Connected) => string | null;
  run: (site: Site, ctx: { firstRun: boolean }) => Promise<string | void>;
};

// ─── Search Console ─────────────────────────────────────────────────────────

type TopRow = { key: string; clicks: number; impressions: number; ctr: number; position: number; prevClicks: number | null; prevPosition: number | null };

async function gscTop(property: string, dimension: "query" | "page", start: Date, end: Date): Promise<TopRow[]> {
  const span = Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1;
  const [cur, prev] = await Promise.all([
    querySearchAnalytics(property, { startDate: ymd(start), endDate: ymd(end), dimensions: [dimension], rowLimit: 50 }),
    querySearchAnalytics(property, {
      startDate: ymd(addDays(start, -span)),
      endDate: ymd(addDays(start, -1)),
      dimensions: [dimension],
      rowLimit: 1000,
    }),
  ]);
  const prevByKey = new Map<string, GscRow>(prev.map((r) => [r.keys?.[0] ?? "", r]));
  return cur.map((r) => {
    const key = r.keys?.[0] ?? "";
    const p = prevByKey.get(key);
    return {
      key,
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: r.ctr,
      position: r.position,
      prevClicks: p ? p.clicks : null,
      prevPosition: p ? p.position : null,
    };
  });
}

const gsc: Collector = {
  source: "gsc",
  label: "Search Console",
  cadenceMinutes: () => 355,
  skipReason: (site, c) => (!c.google ? "Google not connected" : !site.gscProperty ? "No Search Console property" : null),
  async run(site, { firstRun }) {
    const property = site.gscProperty!;
    const end = addDays(utcDay(), -1);
    const start = addDays(end, firstRun ? -480 : -14);
    const rows = await querySearchAnalytics(property, {
      startDate: ymd(start),
      endDate: ymd(end),
      dimensions: ["date"],
      rowLimit: 25000,
    });
    const series: Record<string, Point[]> = { clicks: [], impressions: [], position: [] };
    for (const r of rows) {
      const date = r.keys?.[0];
      if (!date) continue;
      series.clicks.push({ date, value: r.clicks });
      series.impressions.push({ date, value: r.impressions });
      series.position.push({ date, value: r.position });
    }
    await writeDaily(site.id, "gsc", series);

    // Top queries & pages over the last 28 complete days, with previous-period comparison.
    const lastDate = rows.length ? rows[rows.length - 1].keys![0] : ymd(end);
    const topEnd = new Date(`${lastDate}T00:00:00Z`);
    const topStart = addDays(topEnd, -27);
    const [queries, pages] = await Promise.all([
      gscTop(property, "query", topStart, topEnd),
      gscTop(property, "page", topStart, topEnd),
    ]);
    const meta = { startDate: ymd(topStart), endDate: ymd(topEnd) };
    await writeInsight(site.id, "gsc", "top_queries", { ...meta, rows: queries });
    await writeInsight(site.id, "gsc", "top_pages", { ...meta, rows: pages });
    return `${rows.length} days, ${queries.length} queries`;
  },
};

// ─── PostHog ────────────────────────────────────────────────────────────────

const PERIODS = [7, 28, 90] as const;
const TOP_REFERRERS_PER_DAY = 5;
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
/** A browser shared by this many visitors, in this many countries, with one page each, is a sweep. */
const NOISE_MIN_PERSONS = 15;
const NOISE_MIN_COUNTRIES = 8;

/**
 * Pageviews for the time window, without browser-days that are one page per visitor
 * spread across many countries. The same browser on another day still counts.
 */
function pageviewWhere(base: string, time: string): string {
  const window = `${base} AND ${time}`;
  return `${window} AND (toString(toDate(timestamp)), properties.$raw_user_agent) NOT IN (
    SELECT toString(toDate(timestamp)) AS day, properties.$raw_user_agent AS ua
    FROM events
    WHERE ${window} AND properties.$raw_user_agent != ''
    GROUP BY day, ua
    HAVING uniq(person_id) >= ${NOISE_MIN_PERSONS}
       AND uniq(properties.$geoip_country_code) >= ${NOISE_MIN_COUNTRIES}
       AND count() = uniq(person_id)
  )`;
}

/** One point per day in the window. A day the query omits was empty after filtering, so it is 0. */
function fillDaily(points: Point[], from: string, to: string): Point[] {
  const values = new Map(points.map((p) => [p.date, p.value]));
  const out: Point[] = [];
  for (let day = parseYmd(from); day.getTime() <= parseYmd(to).getTime(); day = addDays(day, 1)) {
    const date = ymd(day);
    out.push({ date, value: values.get(date) ?? 0 });
  }
  return out;
}

/** Top referring domains per day, keyed as `referrer:<domain>`. Empty and missing domains are direct traffic. */
export function dailyReferrerSeries(rows: unknown[][]): Record<string, Point[]> {
  const byDay = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const day = String(row[0] ?? "");
    if (!DAY_KEY.test(day)) continue;
    const visitors = Number(row[2]);
    if (!Number.isFinite(visitors) || visitors <= 0) continue;
    const raw = row[1] == null ? "" : String(row[1]).replace(/[\r\n\t]/g, " ").trim();
    const key = (raw === "" ? "$direct" : raw).slice(0, 180);
    const counts = byDay.get(day) ?? new Map<string, number>();
    counts.set(key, (counts.get(key) ?? 0) + visitors);
    byDay.set(day, counts);
  }
  const series: Record<string, Point[]> = {};
  for (const [day, counts] of byDay) {
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, TOP_REFERRERS_PER_DAY);
    for (const [key, value] of top) {
      const metricKey = `${DAILY_REFERRER_PREFIX}${key}`;
      (series[metricKey] ??= []).push({ date: day, value });
    }
  }
  return series;
}

const posthog: Collector = {
  source: "posthog",
  label: "PostHog",
  cadenceMinutes: () => 115,
  skipReason: (site, c) => (!c.posthog ? "PostHog not connected" : !site.posthogProjectId ? "No PostHog project" : null),
  async run(site, { firstRun }) {
    const pid = site.posthogProjectId!;
    const host = hostClause(site.posthogHost);
    const since = ymd(addDays(utcDay(), firstRun ? -180 : -14));
    const base = `event = '$pageview'${host}`;
    // Existing sites already have daily visitors. Referrers are new, so the first run that finds
    // none of them walks the same 180-day history as a first collect. Later runs refresh 14 days.
    const referrerBackfill =
      firstRun ||
      !(await prisma.dailyMetric.findFirst({
        where: { siteId: site.id, source: "posthog", key: { startsWith: DAILY_REFERRER_PREFIX } },
        select: { id: true },
      }));
    const sinceReferrers = referrerBackfill ? ymd(addDays(utcDay(), -180)) : since;

    const dailyWhere = pageviewWhere(base, `timestamp >= toDateTime('${since} 00:00:00')`);
    const halfYearWhere = pageviewWhere(base, "timestamp >= now() - INTERVAL 180 DAY");
    const monthWhere = pageviewWhere(base, "timestamp >= now() - INTERVAL 28 DAY");
    const [daily, summary, pages, referrers] = await Promise.all([
      runHogql(
        pid,
        `SELECT toString(toDate(timestamp)) AS day, count() AS pageviews, uniq(person_id) AS visitors
         FROM events WHERE ${dailyWhere}
         GROUP BY day ORDER BY day`,
      ),
      runHogql(
        pid,
        `SELECT ${PERIODS.map(
          (n) =>
            `uniqIf(person_id, timestamp >= now() - INTERVAL ${n} DAY) AS v${n},
             uniqIf(person_id, timestamp < now() - INTERVAL ${n} DAY AND timestamp >= now() - INTERVAL ${n * 2} DAY) AS vp${n},
             countIf(timestamp >= now() - INTERVAL ${n} DAY) AS pv${n},
             countIf(timestamp < now() - INTERVAL ${n} DAY AND timestamp >= now() - INTERVAL ${n * 2} DAY) AS pvp${n}`,
        ).join(",\n")}
         FROM events WHERE ${halfYearWhere}`,
      ),
      runHogql(
        pid,
        `SELECT properties.$pathname AS path, count() AS pageviews, uniq(person_id) AS visitors
         FROM events WHERE ${monthWhere}
         GROUP BY path ORDER BY pageviews DESC LIMIT 25`,
      ),
      runHogql(
        pid,
        `SELECT properties.$referring_domain AS referrer, uniq(person_id) AS visitors
         FROM events WHERE ${monthWhere}
         GROUP BY referrer ORDER BY visitors DESC LIMIT 15`,
      ),
    ]);

    const today = ymd(utcDay());
    const pageviews: Point[] = [];
    const visitors: Point[] = [];
    for (const [day, pv, v] of daily.results as [string, number, number][]) {
      if (!DAY_KEY.test(day)) continue;
      pageviews.push({ date: day, value: Number(pv) });
      visitors.push({ date: day, value: Number(v) });
    }
    const series: Record<string, Point[]> = {
      pageviews: fillDaily(pageviews, since, today),
      visitors: fillDaily(visitors, since, today),
    };
    await writeDaily(site.id, "posthog", series);

    const row = (summary.results[0] ?? []) as number[];
    const col = (name: string) => Number(row[summary.columns.indexOf(name)] ?? 0);
    const periods = Object.fromEntries(
      PERIODS.map((n) => [
        n,
        { visitors: col(`v${n}`), visitorsPrev: col(`vp${n}`), pageviews: col(`pv${n}`), pageviewsPrev: col(`pvp${n}`) },
      ]),
    );
    await writeInsight(site.id, "posthog", "summary", periods);
    await writeInsight(site.id, "posthog", "top_pages", {
      rows: (pages.results as [string | null, number, number][]).map(([path, pv, v]) => ({
        key: path ?? "(none)",
        pageviews: Number(pv),
        visitors: Number(v),
      })),
    });
    await writeInsight(site.id, "posthog", "top_referrers", {
      rows: (referrers.results as [string | null, number][]).map(([ref, v]) => ({
        key: ref ?? "$direct",
        visitors: Number(v),
      })),
    });
    const referrersByDay = await runHogql(
      pid,
      `SELECT day, referrer, visitors
       FROM (
         SELECT day, referrer, visitors, row_number() OVER (PARTITION BY day ORDER BY visitors DESC) AS rn
         FROM (
           SELECT toString(toDate(timestamp)) AS day,
                  if(properties.$referring_domain IS NULL OR properties.$referring_domain = '', '$direct', properties.$referring_domain) AS referrer,
                  uniq(person_id) AS visitors
           FROM events
           WHERE ${pageviewWhere(base, `timestamp >= toDateTime('${sinceReferrers} 00:00:00')`)}
           GROUP BY day, referrer
         )
       )
       WHERE rn <= ${TOP_REFERRERS_PER_DAY}
       ORDER BY day, visitors DESC
       LIMIT 2000`,
    );
    const referrerSeries = dailyReferrerSeries(referrersByDay.results);
    const lastReferrerDay = Object.values(referrerSeries).reduce((max, points) => {
      for (const p of points) if (p.date > max) max = p.date;
      return max;
    }, sinceReferrers);
    await replacePrefixedDaily(
      site.id,
      "posthog",
      DAILY_REFERRER_PREFIX,
      sinceReferrers,
      lastReferrerDay > today ? lastReferrerDay : today,
      referrerSeries,
    );
    return `${series.visitors.length} days`;
  },
};

// ─── Sentry ─────────────────────────────────────────────────────────────────

const sentry: Collector = {
  source: "sentry",
  label: "Sentry",
  cadenceMinutes: () => 55,
  skipReason: (site, c) => (!c.sentry ? "Sentry not connected" : !site.sentryProject ? "No Sentry project" : null),
  async run(site, { firstRun }) {
    const project = site.sentryProject!;
    // Issues and event stats use different endpoints/scopes: keep whichever succeeds.
    const [issues, events] = await Promise.allSettled([
      listSentryIssues(project, { limit: 10 }),
      sentryDailyEvents(project, firstRun ? 90 : 7),
    ]);
    if (issues.status === "fulfilled") await writeInsight(site.id, "sentry", "issues", issues.value);
    if (events.status === "fulfilled") await writeDaily(site.id, "sentry", { events: events.value });
    if (issues.status === "rejected") throw issues.reason;
    if (events.status === "rejected") {
      throw new Error(`Issues OK (${issues.value.total} unresolved) but event stats failed: ${errorMessage(events.reason)}`);
    }
    return `${issues.value.total} unresolved`;
  },
};

// ─── Domain SEO ─────────────────────────────────────────────────────────────

const seo: Collector = {
  source: "seo",
  label: "Domain SEO",
  cadenceMinutes: (c) => (c.dataforseo ? c.seoCadenceDays * 1440 - 60 : 1440 - 60),
  skipReason: (_site, c) => (!c.dataforseo && !c.openpagerank && !c.ahrefs ? "No SEO provider connected" : null),
  async run(site) {
    const data = await fetchDomainSeo(site.domain);
    if (!data.organic && !data.backlinks && !data.openPageRank && !data.ahrefs) {
      throw new Error(data.errors.join(" · ") || "No SEO data returned");
    }
    const date = ymd(utcDay());
    const pts: Record<string, Point[]> = {};
    const put = (key: string, v: number | null | undefined) => {
      if (typeof v === "number" && Number.isFinite(v)) pts[key] = [{ date, value: v }];
    };
    put("organic_keywords", data.organic?.keywords);
    put("organic_etv", data.organic?.etv);
    put("organic_top10", data.organic?.top10);
    put("rank", data.backlinks?.rank);
    put("backlinks", data.backlinks?.backlinks);
    put("referring_domains", data.backlinks?.referringDomains);
    put("opr", data.openPageRank?.score);
    put("ahrefs_dr", data.ahrefs?.domainRating);
    await writeDaily(site.id, "seo", pts);
    await writeInsight(site.id, "seo", "summary", { ...data, collectedAt: new Date().toISOString() });
    if (data.errors.length) return `partial: ${data.errors.join(" · ")}`;
    return data.cost ? `cost $${data.cost.toFixed(4)}` : undefined;
  },
};

// ─── DataForSEO extras (history, competitors, keyword metrics) ───────────────

const WEEK = 7 * 1440 - 60;
const MONTH = 30 * 1440 - 60;
const needsDfs = (_site: Site, c: Connected) => (!c.dataforseo ? "DataForSEO not connected" : null);
const usd = (cost: number) => (cost ? ` · cost $${cost.toFixed(4)}` : "");

const backlinks: Collector = {
  source: "backlinks",
  label: "Backlink history",
  cadenceMinutes: () => WEEK,
  skipReason: needsDfs,
  async run(site, { firstRun }) {
    // First run backfills 16 months (to line up with Search Console history); then a 2-week overlap.
    const { days, cost, daysBack } = await backlinksNewLost(site.domain, firstRun ? 490 : 14);
    const pts = (f: (d: (typeof days)[number]) => number) => days.map((d) => ({ date: d.date, value: f(d) }));
    await writeDaily(site.id, "seo", {
      new_backlinks: pts((d) => d.newBacklinks),
      lost_backlinks: pts((d) => d.lostBacklinks),
      new_referring_domains: pts((d) => d.newReferringDomains),
      lost_referring_domains: pts((d) => d.lostReferringDomains),
    });
    return `${days.length} days (window ${daysBack} d)${usd(cost)}`;
  },
};

const rankHist: Collector = {
  source: "rank_history",
  label: "Ranking history",
  cadenceMinutes: () => MONTH,
  skipReason: needsDfs,
  async run(site, { firstRun }) {
    const { months, cost } = await rankHistory(site.domain, firstRun ? RANK_HISTORY_START : ymd(addDays(utcDay(), -95)));
    const pts = (f: (m: (typeof months)[number]) => number) => months.map((m) => ({ date: m.month, value: f(m) }));
    await writeDaily(site.id, "seo", {
      monthly_keywords: pts((m) => m.keywords),
      monthly_etv: pts((m) => m.etv),
      monthly_top10: pts((m) => m.top10),
    });
    return `${months.length} months${usd(cost)}`;
  },
};

const competitors: Collector = {
  source: "competitors",
  label: "Competitors",
  cadenceMinutes: () => MONTH,
  skipReason: needsDfs,
  async run(site) {
    const r = await competitorsAndGaps(site.domain);
    await writeInsight(site.id, "seo", "competitors", {
      competitors: r.competitors,
      gaps: r.gaps.slice(0, 60),
      collectedAt: new Date().toISOString(),
    });
    return `${r.competitors.length} competitors, ${r.gaps.length} gaps${usd(r.cost)}`;
  },
};

const keywords: Collector = {
  source: "keywords",
  label: "Keyword metrics",
  cadenceMinutes: () => WEEK,
  skipReason: (site, c) => (!c.dataforseo ? "DataForSEO not connected" : !site.gscProperty ? "No Search Console property" : null),
  async run(site) {
    const top = await prisma.insight.findUnique({ where: { siteId_source_kind: { siteId: site.id, source: "gsc", kind: "top_queries" } } });
    const queries = ((top?.data as { rows?: { key: string }[] } | null)?.rows ?? []).map((r) => r.key);
    if (!queries.length) throw new Error("No Search Console queries yet — waiting for the first GSC sync");
    const { rows, cost } = await keywordOverview(queries);
    await writeInsight(site.id, "seo", "keywords", { rows, collectedAt: new Date().toISOString() });
    return `${rows.length} keywords${usd(cost)}`;
  },
};

// ─── Health ─────────────────────────────────────────────────────────────────

const health: Collector = {
  source: "health",
  label: "Uptime",
  cadenceMinutes: () => 4,
  skipReason: () => null,
  async run(site) {
    const r = await checkHealth(site.url);
    await prisma.healthCheck.create({
      data: {
        siteId: site.id,
        ok: r.ok,
        statusCode: r.statusCode,
        latencyMs: r.latencyMs,
        sslExpiresAt: r.sslExpiresAt,
        error: r.error,
      },
    });
    await prisma.healthCheck.deleteMany({
      where: { siteId: site.id, checkedAt: { lt: addDays(new Date(), -90) } },
    });
    return r.ok ? `${r.statusCode} in ${r.latencyMs} ms` : `DOWN: ${r.error}`;
  },
};

export const COLLECTORS: Record<Source, Collector> = {
  health,
  gsc,
  posthog,
  sentry,
  seo,
  backlinks,
  rank_history: rankHist,
  competitors,
  keywords,
};
