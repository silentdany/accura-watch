import type { Site } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { addDays, utcDay, ymd, DAY_MS } from "@/lib/dates";
import { querySearchAnalytics, type GscRow } from "@/lib/providers/google";
import { hostClause, runHogql } from "@/lib/providers/posthog";
import { listSentryIssues, sentryDailyEvents } from "@/lib/providers/sentry";
import { fetchDomainSeo } from "@/lib/providers/seo";
import { checkHealth } from "@/lib/providers/health";
import { writeDaily, writeInsight, type Point } from "./store";
import { errorMessage } from "@/lib/http";

export type Source = "health" | "gsc" | "posthog" | "sentry" | "seo";
export const SOURCES: Source[] = ["health", "gsc", "posthog", "sentry", "seo"];

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

    const [daily, summary, pages, referrers] = await Promise.all([
      runHogql(
        pid,
        `SELECT toString(toDate(timestamp)) AS day, count() AS pageviews, uniq(person_id) AS visitors
         FROM events WHERE ${base} AND timestamp >= toDateTime('${since} 00:00:00')
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
         FROM events WHERE ${base} AND timestamp >= now() - INTERVAL 180 DAY`,
      ),
      runHogql(
        pid,
        `SELECT properties.$pathname AS path, count() AS pageviews, uniq(person_id) AS visitors
         FROM events WHERE ${base} AND timestamp >= now() - INTERVAL 28 DAY
         GROUP BY path ORDER BY pageviews DESC LIMIT 25`,
      ),
      runHogql(
        pid,
        `SELECT properties.$referring_domain AS referrer, uniq(person_id) AS visitors
         FROM events WHERE ${base} AND timestamp >= now() - INTERVAL 28 DAY
         GROUP BY referrer ORDER BY visitors DESC LIMIT 15`,
      ),
    ]);

    const series: Record<string, Point[]> = { pageviews: [], visitors: [] };
    for (const [day, pv, v] of daily.results as [string, number, number][]) {
      series.pageviews.push({ date: day, value: Number(pv) });
      series.visitors.push({ date: day, value: Number(v) });
    }
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

export const COLLECTORS: Record<Source, Collector> = { health, gsc, posthog, sentry, seo };
