import type { Site } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { addDays, utcDay, ymd, type Range } from "@/lib/dates";

/**
 * Cross-source insights: numbers that only exist once Search Console, PostHog, Sentry,
 * uptime checks and SEO providers sit in the same database.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type Ratio = { value: number; prev: number | null };

export type MetricKey = "clicks" | "impressions" | "position" | "visitors" | "errors" | "latency" | "links";

export type Correlation = {
  driver: MetricKey;
  outcome: MetricKey;
  /** Time between a change in the driver and the outcome, in `unit`s. */
  lag: number;
  unit: "day" | "week";
  /** Pearson r on detrended values (position sign flipped: positive = better ranking). */
  r: number;
  /** Number of paired data points (days or weeks). */
  days: number;
  strength: "strong" | "moderate" | "weak" | "none";
  sentence: string;
  /**
   * Raw (not detrended) values behind the correlation, for charting: one point per day or per week.
   * Position is stored as-is (lower = better).
   */
  series: { dates: string[]; driver: (number | null)[]; outcome: (number | null)[] };
};

export type QueryOpportunity = {
  query: string;
  impressions: number;
  clicks: number;
  position: number;
  ctr: number;
  expectedCtr: number;
  /** Extra clicks per 28 days if CTR matched the typical CTR at this position. */
  missedClicks: number;
  /** DataForSEO keyword metrics, when collected. */
  volume: number | null;
  difficulty: number | null;
  intent: string | null;
};

export type CompetitorRow = {
  domain: string;
  sharedKeywords: number;
  keywords: number;
  /** DataForSEO's traffic estimate. */
  etv: number;
  /** Estimate corrected by this site's real-vs-estimated ratio. */
  calibratedTraffic: number | null;
};

export type ContentGap = {
  keyword: string;
  volume: number | null;
  difficulty: number | null;
  intent: string | null;
  competitor: string;
  competitorRank: number | null;
  competitors: number;
};

export type PageJoin = {
  path: string;
  searchClicks: number | null;
  visitors: number | null;
  /** Search clicks per visitor on that page (both over the last 28 days). */
  searchShare: number | null;
};

export type AuthorityPoint = { date: string; value: number };

export type SiteInsights = {
  /** Search clicks per PostHog visitor (sum of daily values over the same days). */
  searchShare: Ratio | null;
  /** Sentry error events per 1,000 visitors. */
  errorsPer1k: Ratio | null;
  /**
   * Real Search Console clicks ÷ DataForSEO's traffic estimate, median over past months.
   * Used to calibrate competitor traffic estimates.
   */
  calibration: { ratio: number; months: number; estimated: number; real: number } | null;
  /** Impressions ÷ monthly search volume over the top queries (28 days, volume scaled to 28 days). */
  shareOfVoice: { value: number; queries: number } | null;
  /** Search clicks by DataForSEO search intent (top queries). */
  intentMix: { intent: string; clicks: number; share: number }[];
  /** Referring domains gained / lost over the last 28 days. */
  links28d: { gained: number; lost: number } | null;
  competitors: CompetitorRow[];
  contentGaps: ContentGap[];
  competitorsUpdatedAt: string | null;
  /** Search clicks (28d) per referring domain. */
  clicksPerReferringDomain: number | null;
  correlations: Correlation[];
  correlationWindowDays: number;
  ctrGaps: QueryOpportunity[];
  strikingDistance: QueryOpportunity[];
  pages: PageJoin[];
  authority: {
    label: "DR" | "Rank" | "OPR" | null;
    score: AuthorityPoint[];
    referringDomains: AuthorityPoint[];
    organicKeywords: AuthorityPoint[];
  };
};

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Typical organic CTR by position (industry averages, positions 1–10). */
const TYPICAL_CTR = [0.28, 0.155, 0.11, 0.08, 0.065, 0.05, 0.04, 0.032, 0.027, 0.023];

export function typicalCtr(position: number): number {
  const p = Math.max(1, Math.round(position));
  return p <= 10 ? TYPICAL_CTR[p - 1] : Math.max(0.002, 0.02 * (10 / p));
}

function days(end: Date, n: number): string[] {
  return Array.from({ length: n }, (_, i) => ymd(addDays(end, i - n + 1)));
}

const sum = (m: Map<string, number>, ds: string[]) => ds.reduce((a, d) => a + (m.get(d) ?? 0), 0);

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  const mx = xs.reduce((a, v) => a + v, 0) / n;
  const my = ys.reduce((a, v) => a + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
}

/** Deviation from the trailing 7-day mean, so two series that simply grow together don't look correlated. */
function detrend(m: Map<string, number>, ds: string[]): Map<string, number> {
  const out = new Map<string, number>();
  ds.forEach((d, i) => {
    const v = m.get(d);
    if (v == null) return;
    const window = ds.slice(Math.max(0, i - 7), i).map((x) => m.get(x)).filter((x): x is number => x != null);
    if (window.length < 5) return;
    out.set(d, v - window.reduce((a, x) => a + x, 0) / window.length);
  });
  return out;
}

const PHRASE: Record<MetricKey, { hi: string; lo: string }> = {
  clicks: { hi: "more search clicks", lo: "fewer search clicks" },
  impressions: { hi: "more impressions", lo: "fewer impressions" },
  position: { hi: "better rankings", lo: "worse rankings" },
  visitors: { hi: "more visitors", lo: "fewer visitors" },
  errors: { hi: "more errors", lo: "fewer errors" },
  latency: { hi: "slower responses", lo: "faster responses" },
  links: { hi: "more new referring domains", lo: "fewer new referring domains" },
};

export const METRIC_LABEL: Record<MetricKey, string> = {
  clicks: "Search clicks",
  impressions: "Impressions",
  position: "Ranking",
  visitors: "Visitors",
  errors: "Errors",
  latency: "Response time",
  links: "New referring domains",
};

const PAIRS: { driver: MetricKey; outcome: MetricKey; maxLag: number }[] = [
  { driver: "impressions", outcome: "clicks", maxLag: 0 },
  { driver: "position", outcome: "clicks", maxLag: 2 },
  { driver: "clicks", outcome: "visitors", maxLag: 0 },
  { driver: "latency", outcome: "position", maxLag: 3 },
  { driver: "latency", outcome: "visitors", maxLag: 2 },
  { driver: "errors", outcome: "visitors", maxLag: 2 },
];

const MIN_DAYS = 21;

function strength(r: number): Correlation["strength"] {
  const a = Math.abs(r);
  return a >= 0.6 ? "strong" : a >= 0.4 ? "moderate" : a >= 0.25 ? "weak" : "none";
}

function sentence(driver: MetricKey, outcome: MetricKey, lag: number, r: number, s: Correlation["strength"], unit: Correlation["unit"] = "day"): string {
  const cap = (t: string) => t[0].toUpperCase() + t.slice(1);
  if (s === "none") return `No measurable link between ${METRIC_LABEL[driver].toLowerCase()} and ${METRIC_LABEL[outcome].toLowerCase()}.`;
  const link = lag === 0 ? (unit === "week" ? "go with, the same week," : "go with") : `are followed ${lag} ${unit}${lag > 1 ? "s" : ""} later by`;
  return `${cap(PHRASE[driver].hi)} ${link} ${r > 0 ? PHRASE[outcome].hi : PHRASE[outcome].lo}.`;
}

function correlate(series: Partial<Record<MetricKey, Map<string, number>>>, ds: string[]): Correlation[] {
  const detrended = Object.fromEntries(
    Object.entries(series).map(([k, m]) => [k, detrend(m!, ds)]),
  ) as Partial<Record<MetricKey, Map<string, number>>>;
  const out: Correlation[] = [];
  for (const { driver, outcome, maxLag } of PAIRS) {
    const a = detrended[driver];
    const b = detrended[outcome];
    if (!a || !b) continue;
    let best: { lag: number; r: number; n: number } | null = null;
    for (let lag = 0; lag <= maxLag; lag++) {
      const xs: number[] = [];
      const ys: number[] = [];
      ds.forEach((d, i) => {
        const x = a.get(d);
        const y = ds[i + lag] ? b.get(ds[i + lag]) : undefined;
        if (x != null && y != null) {
          xs.push(x);
          ys.push(y);
        }
      });
      if (xs.length < MIN_DAYS) continue;
      const r = pearson(xs, ys);
      if (!best || Math.abs(r) > Math.abs(best.r)) best = { lag, r, n: xs.length };
    }
    if (!best) continue;
    const s = strength(best.r);
    const raw = (k: MetricKey, m: Map<string, number>) => ds.map((d) => (m.has(d) ? (k === "position" ? -m.get(d)! : m.get(d)!) : null));
    out.push({
      series: { dates: ds, driver: raw(driver, series[driver]!), outcome: raw(outcome, series[outcome]!) },
      driver,
      outcome,
      lag: s === "none" ? 0 : best.lag,
      unit: "day",
      r: Number(best.r.toFixed(2)),
      days: best.n,
      strength: s,
      sentence: sentence(driver, outcome, best.lag, best.r, s),
    });
  }
  const order = { strong: 0, moderate: 1, weak: 2, none: 3 };
  return out.sort((x, y) => order[x.strength] - order[y.strength] || Math.abs(y.r) - Math.abs(x.r));
}

/** Sum daily values into weeks ending on each Sunday; the current (partial) week is dropped. */
function weekly(m: Map<string, number>, ds: string[]): { weeks: string[]; values: Map<string, number> } {
  const values = new Map<string, number>();
  const weeks: string[] = [];
  let acc = 0;
  let n = 0;
  for (const d of ds) {
    if (m.has(d)) {
      acc += m.get(d)!;
      n++;
    }
    if (new Date(`${d}T00:00:00Z`).getUTCDay() === 0) {
      weeks.push(d);
      if (n >= 5) values.set(d, acc);
      acc = 0;
      n = 0;
    }
  }
  return { weeks, values };
}

/** New referring domains → search clicks, week by week, lag 0–8 weeks (links take time to count). */
function linksToClicks(links: Map<string, number>, clicks: Map<string, number>, ds: string[]): Correlation | null {
  const a = weekly(links, ds);
  const b = weekly(clicks, ds);
  const detrendW = (w: { weeks: string[]; values: Map<string, number> }) => {
    const out = new Map<string, number>();
    w.weeks.forEach((wk, i) => {
      const v = w.values.get(wk);
      const prev = w.weeks.slice(Math.max(0, i - 4), i).map((x) => w.values.get(x)).filter((x): x is number => x != null);
      if (v != null && prev.length >= 3) out.set(wk, v - prev.reduce((s2, x) => s2 + x, 0) / prev.length);
    });
    return out;
  };
  const da = detrendW(a);
  const db = detrendW(b);
  const weeks = a.weeks;
  let best: { lag: number; r: number; n: number } | null = null;
  for (let lag = 0; lag <= 8; lag++) {
    const xs: number[] = [];
    const ys: number[] = [];
    weeks.forEach((wk, i) => {
      const x = da.get(wk);
      const y = weeks[i + lag] ? db.get(weeks[i + lag]) : undefined;
      if (x != null && y != null) {
        xs.push(x);
        ys.push(y);
      }
    });
    if (xs.length < 12) continue;
    const r = pearson(xs, ys);
    if (!best || Math.abs(r) > Math.abs(best.r)) best = { lag, r, n: xs.length };
  }
  if (!best) return null;
  const st = strength(best.r);
  return {
    series: {
      dates: weeks,
      driver: weeks.map((w) => a.values.get(w) ?? null),
      outcome: weeks.map((w) => b.values.get(w) ?? null),
    },
    driver: "links",
    outcome: "clicks",
    lag: st === "none" ? 0 : best.lag,
    unit: "week",
    r: Number(best.r.toFixed(2)),
    days: best.n,
    strength: st,
    sentence: sentence("links", "clicks", best.lag, best.r, st, "week"),
  };
}

const median = (xs: number[]) => {
  const v = [...xs].sort((x, y) => x - y);
  return v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
};

const pathOf = (u: string) => {
  const p = u.replace(/^https?:\/\/[^/]+/, "").split(/[?#]/)[0] || "/";
  return p.length > 1 ? p.replace(/\/$/, "") : p;
};

// ─── Loader ─────────────────────────────────────────────────────────────────

type TopRow = { key: string; clicks: number; impressions: number; ctr: number; position: number };

const WINDOW = 90;
const LONG_DAYS = 400;

export async function loadSiteInsights(site: Site, range: Range): Promise<SiteInsights> {
  const today = utcDay();
  const since = addDays(today, -(Math.max(WINDOW, range * 2) + 10));
  const [metrics, seo, checks, insights] = await Promise.all([
    prisma.dailyMetric.findMany({
      // Search Console over ~13 months: monthly calibration and the weekly links → clicks correlation need it.
      where: {
        siteId: site.id,
        OR: [
          { source: { in: ["posthog", "sentry"] }, date: { gte: since } },
          { source: "gsc", date: { gte: addDays(today, -LONG_DAYS) } },
        ],
      },
      select: { source: true, key: true, date: true, value: true },
    }),
    prisma.dailyMetric.findMany({
      where: { siteId: site.id, source: "seo", date: { gte: addDays(today, -6 * 365) } },
      select: { key: true, date: true, value: true },
      orderBy: { date: "asc" },
    }),
    prisma.healthCheck.findMany({
      where: { siteId: site.id, checkedAt: { gte: addDays(today, -WINDOW) }, ok: true, latencyMs: { not: null } },
      select: { checkedAt: true, latencyMs: true },
    }),
    prisma.insight.findMany({
      where: {
        siteId: site.id,
        OR: [
          { source: "gsc", kind: { in: ["top_queries", "top_pages"] } },
          { source: "posthog", kind: "top_pages" },
          { source: "seo", kind: { in: ["keywords", "competitors"] } },
        ],
      },
    }),
  ]);

  const m = (source: string, key: string) => {
    const map = new Map<string, number>();
    for (const r of metrics) if (r.source === source && r.key === key) map.set(ymd(r.date), r.value);
    return map;
  };
  const clicks = m("gsc", "clicks");
  const impressions = m("gsc", "impressions");
  const position = m("gsc", "position");
  const visitors = m("posthog", "visitors");
  const errors = m("sentry", "events");

  const latency = new Map<string, number>();
  {
    const acc = new Map<string, { s: number; n: number }>();
    for (const c of checks) {
      const d = ymd(c.checkedAt);
      const a = acc.get(d) ?? { s: 0, n: 0 };
      a.s += c.latencyMs!;
      a.n += 1;
      acc.set(d, a);
    }
    for (const [d, a] of acc) latency.set(d, a.s / a.n);
  }

  const hasGsc = !!site.gscProperty && clicks.size > 0;
  const hasPh = !!site.posthogProjectId && visitors.size > 0;
  const hasSentry = !!site.sentryProject;

  // Search share — on the Search Console window (it lags ~2 days behind PostHog).
  let searchShare: Ratio | null = null;
  if (hasGsc && hasPh) {
    const end = new Date(`${[...clicks.keys()].sort().pop()}T00:00:00Z`);
    const cur = days(end, range);
    const prev = days(addDays(end, -range), range);
    const v = sum(visitors, cur);
    const vp = sum(visitors, prev);
    if (v > 0) searchShare = { value: sum(clicks, cur) / v, prev: vp > 0 ? sum(clicks, prev) / vp : null };
  }

  let errorsPer1k: Ratio | null = null;
  if (hasSentry && hasPh) {
    const cur = days(today, range);
    const prev = days(addDays(today, -range), range);
    const v = sum(visitors, cur);
    const vp = sum(visitors, prev);
    if (v > 0) errorsPer1k = { value: (sum(errors, cur) / v) * 1000, prev: vp > 0 ? (sum(errors, prev) / vp) * 1000 : null };
  }

  // SEO history
  const seoSeries = (key: string): AuthorityPoint[] =>
    seo.filter((r) => r.key === key).map((r) => ({ date: ymd(r.date), value: r.value }));
  const dr = seoSeries("ahrefs_dr");
  const rank = seoSeries("rank");
  const opr = seoSeries("opr").map((p) => ({ ...p, value: p.value * 10 }));
  const [label, score]: [SiteInsights["authority"]["label"], AuthorityPoint[]] = dr.length
    ? ["DR", dr]
    : rank.length
      ? ["Rank", rank]
      : opr.length
        ? ["OPR", opr]
        : [null, []];
  const referringDomains = seoSeries("referring_domains");
  // Monthly history from historical_rank_overview when collected, else the weekly snapshots.
  const monthlyKeywords = seoSeries("monthly_keywords");
  const organicKeywords = monthlyKeywords.length >= 2 ? monthlyKeywords : seoSeries("organic_keywords");

  // Calibration: real clicks ÷ DataForSEO estimate, per fully-covered month, median of the last 12.
  let calibration: SiteInsights["calibration"] = null;
  if (hasGsc) {
    const ratios: { real: number; est: number }[] = [];
    for (const mo of seoSeries("monthly_etv").slice(-13)) {
      if (mo.value <= 0) continue;
      const start = new Date(`${mo.date}T00:00:00Z`);
      const next = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
      const inMonth = days(addDays(next, -1), Math.round((next.getTime() - start.getTime()) / 86_400_000));
      if (inMonth.filter((d) => clicks.has(d)).length < inMonth.length - 2) continue;
      ratios.push({ real: sum(clicks, inMonth), est: mo.value });
    }
    if (ratios.length) {
      const last = ratios.at(-1)!;
      calibration = { ratio: median(ratios.map((x) => x.real / x.est)), months: ratios.length, estimated: last.est, real: last.real };
    } else {
      const etv = seoSeries("organic_etv").pop();
      if (etv && etv.value > 0) {
        const end = new Date(`${[...clicks.keys()].sort().pop()}T00:00:00Z`);
        const real = sum(clicks, days(end, 30));
        calibration = { ratio: real / etv.value, months: 0, estimated: etv.value, real };
      }
    }
  }

  // Backlink velocity
  const newRd = new Map(seoSeries("new_referring_domains").map((p) => [p.date, p.value]));
  const lostRd = new Map(seoSeries("lost_referring_domains").map((p) => [p.date, p.value]));
  let links28d: SiteInsights["links28d"] = null;
  if (newRd.size) {
    const last28 = days(addDays(today, -1), 28);
    links28d = { gained: sum(newRd, last28), lost: sum(lostRd, last28) };
  }

  let clicksPerReferringDomain: number | null = null;
  const rd = referringDomains.at(-1)?.value;
  if (rd && hasGsc) {
    const end = new Date(`${[...clicks.keys()].sort().pop()}T00:00:00Z`);
    clicksPerReferringDomain = sum(clicks, days(end, 28)) / rd;
  }

  // Correlations over the last WINDOW days
  const corrDays = days(today, WINDOW);
  const positionUp = new Map([...position].filter(([d]) => (impressions.get(d) ?? 0) > 0).map(([d, v]) => [d, -v]));
  const errorsFilled = new Map<string, number>();
  if (hasSentry && errors.size) {
    const first = [...errors.keys()].sort()[0];
    for (const d of corrDays) if (d >= first) errorsFilled.set(d, errors.get(d) ?? 0);
  }
  const correlations = correlate(
    {
      ...(hasGsc ? { clicks, impressions, position: positionUp } : {}),
      ...(hasPh ? { visitors } : {}),
      ...(errorsFilled.size ? { errors: errorsFilled } : {}),
      ...(latency.size ? { latency } : {}),
    },
    corrDays,
  );
  if (hasGsc && newRd.size) {
    const netRd = new Map([...newRd].map(([d, v]) => [d, v - (lostRd.get(d) ?? 0)]));
    const c = linksToClicks(netRd, clicks, days(today, LONG_DAYS));
    if (c) {
      correlations.push(c);
      const order = { strong: 0, moderate: 1, weak: 2, none: 3 };
      correlations.sort((x, y) => order[x.strength] - order[y.strength] || Math.abs(y.r) - Math.abs(x.r));
    }
  }

  // Query opportunities
  const ins = <T,>(source: string, kind: string) => insights.find((i) => i.source === source && i.kind === kind)?.data as T | undefined;
  const queries = ins<{ rows: TopRow[] }>("gsc", "top_queries")?.rows ?? [];
  const kw = new Map(
    (ins<{ rows: { keyword: string; volume: number | null; difficulty: number | null; intent: string | null }[] }>("seo", "keywords")?.rows ?? []).map(
      (r) => [r.keyword.toLowerCase(), r],
    ),
  );
  const opp = (q: TopRow): QueryOpportunity => {
    const expected = typicalCtr(q.position);
    const k = kw.get(q.key.toLowerCase());
    return {
      volume: k?.volume ?? null,
      difficulty: k?.difficulty ?? null,
      intent: k?.intent ?? null,
      query: q.key,
      impressions: q.impressions,
      clicks: q.clicks,
      position: q.position,
      ctr: q.ctr,
      expectedCtr: expected,
      missedClicks: Math.max(0, Math.round(q.impressions * (expected - q.ctr))),
    };
  };
  const ctrGaps = queries
    .filter((q) => q.position <= 10 && q.impressions >= 50)
    .map(opp)
    .filter((o) => o.ctr < o.expectedCtr * 0.6 && o.missedClicks >= 3)
    .sort((a, b) => b.missedClicks - a.missedClicks)
    .slice(0, 6);
  const strikingDistance = queries
    .filter((q) => q.position > 10 && q.position <= 20 && q.impressions >= 20)
    .map((q) => ({ ...opp(q), missedClicks: Math.round(q.impressions * typicalCtr(8) - q.clicks) }))
    .sort((a, b) => (b.volume ?? b.impressions) - (a.volume ?? a.impressions))
    .slice(0, 6);

  // Share of voice & intent mix (needs DataForSEO keyword metrics)
  let shareOfVoice: SiteInsights["shareOfVoice"] = null;
  const withVolume = queries.filter((q) => (kw.get(q.key.toLowerCase())?.volume ?? 0) > 0);
  if (withVolume.length) {
    const impr = withVolume.reduce((a, q) => a + q.impressions, 0);
    const vol = withVolume.reduce((a, q) => a + kw.get(q.key.toLowerCase())!.volume! * (28 / 30.4), 0);
    shareOfVoice = { value: impr / vol, queries: withVolume.length };
  }
  const byIntent = new Map<string, number>();
  for (const q of queries) {
    const intent = kw.get(q.key.toLowerCase())?.intent;
    if (intent) byIntent.set(intent, (byIntent.get(intent) ?? 0) + q.clicks);
  }
  const intentTotal = [...byIntent.values()].reduce((a, v) => a + v, 0);
  const intentMix = intentTotal
    ? [...byIntent].map(([intent, c]) => ({ intent, clicks: c, share: c / intentTotal })).sort((a, b) => b.clicks - a.clicks)
    : [];

  // Competitors & content gaps
  const comp = ins<{
    competitors: { domain: string; sharedKeywords: number; keywords: number; etv: number }[];
    gaps: ContentGap[];
    collectedAt?: string;
  }>("seo", "competitors");
  const competitors: CompetitorRow[] = (comp?.competitors ?? []).map((c) => ({
    ...c,
    calibratedTraffic: calibration ? c.etv * calibration.ratio : null,
  }));
  const contentGaps = (comp?.gaps ?? []).slice(0, 12);

  // Pages: search clicks vs PostHog visitors (both last 28 days)
  const gscPages = new Map<string, number>();
  for (const p of ins<{ rows: TopRow[] }>("gsc", "top_pages")?.rows ?? []) {
    const k = pathOf(p.key);
    gscPages.set(k, (gscPages.get(k) ?? 0) + p.clicks);
  }
  const phPages = new Map<string, number>();
  for (const p of ins<{ rows: { key: string; visitors: number }[] }>("posthog", "top_pages")?.rows ?? []) {
    const k = pathOf(p.key);
    phPages.set(k, (phPages.get(k) ?? 0) + p.visitors);
  }
  const pages: PageJoin[] =
    gscPages.size && phPages.size
      ? [...new Set([...gscPages.keys(), ...phPages.keys()])]
          .map((path) => {
            const c = gscPages.get(path) ?? null;
            const v = phPages.get(path) ?? null;
            return { path, searchClicks: c, visitors: v, searchShare: c != null && v ? c / v : null };
          })
          .sort((a, b) => Math.max(b.visitors ?? 0, b.searchClicks ?? 0) - Math.max(a.visitors ?? 0, a.searchClicks ?? 0))
          .slice(0, 10)
      : [];

  return {
    searchShare,
    errorsPer1k,
    calibration,
    shareOfVoice,
    intentMix,
    links28d,
    competitors,
    contentGaps,
    competitorsUpdatedAt: comp?.collectedAt ?? null,
    clicksPerReferringDomain,
    correlations,
    correlationWindowDays: WINDOW,
    ctrGaps,
    strikingDistance,
    pages,
    authority: { label, score, referringDomains, organicKeywords },
  };
}
