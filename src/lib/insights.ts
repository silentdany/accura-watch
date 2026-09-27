import type { Site } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { addDays, utcDay, ymd, type Range } from "@/lib/dates";

/**
 * Cross-source insights: numbers that only exist once Search Console, PostHog, Sentry,
 * uptime checks and SEO providers sit in the same database.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type Ratio = { value: number; prev: number | null };

export type MetricKey = "clicks" | "impressions" | "position" | "visitors" | "errors" | "latency";

export type Correlation = {
  driver: MetricKey;
  outcome: MetricKey;
  /** Days between a change in the driver and the outcome. */
  lag: number;
  /** Pearson r on detrended daily values (position sign flipped: positive = better ranking). */
  r: number;
  days: number;
  strength: "strong" | "moderate" | "weak" | "none";
  sentence: string;
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
  /** DataForSEO's estimated monthly organic traffic vs real Search Console clicks over the last 30 days. */
  estimateVsReal: { estimated: number; real: number } | null;
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
};

export const METRIC_LABEL: Record<MetricKey, string> = {
  clicks: "Search clicks",
  impressions: "Impressions",
  position: "Ranking",
  visitors: "Visitors",
  errors: "Errors",
  latency: "Response time",
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

function sentence(driver: MetricKey, outcome: MetricKey, lag: number, r: number, s: Correlation["strength"]): string {
  const cap = (t: string) => t[0].toUpperCase() + t.slice(1);
  if (s === "none") return `No measurable link between ${METRIC_LABEL[driver].toLowerCase()} and ${METRIC_LABEL[outcome].toLowerCase()}.`;
  const link = lag === 0 ? "go with" : `are followed ${lag} day${lag > 1 ? "s" : ""} later by`;
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
    out.push({
      driver,
      outcome,
      lag: s === "none" ? 0 : best.lag,
      r: Number(best.r.toFixed(2)),
      days: best.n,
      strength: s,
      sentence: sentence(driver, outcome, best.lag, best.r, s),
    });
  }
  const order = { strong: 0, moderate: 1, weak: 2, none: 3 };
  return out.sort((x, y) => order[x.strength] - order[y.strength] || Math.abs(y.r) - Math.abs(x.r));
}

const pathOf = (u: string) => {
  const p = u.replace(/^https?:\/\/[^/]+/, "").split(/[?#]/)[0] || "/";
  return p.length > 1 ? p.replace(/\/$/, "") : p;
};

// ─── Loader ─────────────────────────────────────────────────────────────────

type TopRow = { key: string; clicks: number; impressions: number; ctr: number; position: number };

const WINDOW = 90;

export async function loadSiteInsights(site: Site, range: Range): Promise<SiteInsights> {
  const today = utcDay();
  const since = addDays(today, -(Math.max(WINDOW, range * 2) + 10));
  const [metrics, seo, checks, insights] = await Promise.all([
    prisma.dailyMetric.findMany({
      where: { siteId: site.id, source: { in: ["gsc", "posthog", "sentry"] }, date: { gte: since } },
      select: { source: true, key: true, date: true, value: true },
    }),
    prisma.dailyMetric.findMany({
      where: { siteId: site.id, source: "seo", date: { gte: addDays(today, -400) } },
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
  const organicKeywords = seoSeries("organic_keywords");

  let estimateVsReal: SiteInsights["estimateVsReal"] = null;
  const etv = seoSeries("organic_etv").pop();
  if (etv && hasGsc) {
    const end = new Date(`${[...clicks.keys()].sort().pop()}T00:00:00Z`);
    estimateVsReal = { estimated: etv.value, real: sum(clicks, days(end, 30)) };
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

  // Query opportunities
  const ins = <T,>(source: string, kind: string) => insights.find((i) => i.source === source && i.kind === kind)?.data as T | undefined;
  const queries = ins<{ rows: TopRow[] }>("gsc", "top_queries")?.rows ?? [];
  const opp = (q: TopRow): QueryOpportunity => {
    const expected = typicalCtr(q.position);
    return {
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
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 6);

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
    estimateVsReal,
    clicksPerReferringDomain,
    correlations,
    correlationWindowDays: WINDOW,
    ctrGaps,
    strikingDistance,
    pages,
    authority: { label, score, referringDomains, organicKeywords },
  };
}
