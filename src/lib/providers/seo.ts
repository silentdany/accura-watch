import { errorMessage, fetchJson, HttpError } from "@/lib/http";
import {
  getAhrefsCreds,
  getDataForSeoCreds,
  getOpenPageRankCreds,
  type DataForSeoCreds,
} from "@/lib/integrations";

/**
 * Ahrefs-style domain data without an Ahrefs plan:
 * - DataForSEO (pay-as-you-go, ~$0.01–0.03 per call): Labs domain overview + Backlinks summary.
 *   This is the same data backend OpenSEO uses.
 * - Open PageRank (free): 0–10 authority score.
 * - Ahrefs free Domain Rating endpoint (free APIv3 key, no API units).
 */

type DfsEnvelope<T> = {
  status_code: number;
  status_message: string;
  tasks?: { status_code: number; status_message: string; cost?: number; result?: T[] | null }[];
};

async function dfs<T>(c: DataForSeoCreds, path: string, body: unknown): Promise<{ result: T | null; cost: number }> {
  try {
    return await dfsRaw<T>(c, path, body);
  } catch (e) {
    if (e instanceof HttpError && e.status === 402) {
      throw new Error("DataForSEO balance is empty (402 Payment Required) — top up at app.dataforseo.com/billing");
    }
    throw e;
  }
}

async function dfsRaw<T>(c: DataForSeoCreds, path: string, body: unknown): Promise<{ result: T | null; cost: number }> {
  const { data } = await fetchJson<DfsEnvelope<T>>(`https://api.dataforseo.com/v3${path}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${c.login}:${c.password}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([body]),
    timeoutMs: 45_000,
    label: "DataForSEO",
  });
  if (data.status_code !== 20000) throw new Error(`DataForSEO: ${data.status_message}`);
  const task = data.tasks?.[0];
  if (!task) throw new Error("DataForSEO: empty response");
  // 40102 = "No Search Results" → treat as zero data rather than an error.
  if (task.status_code !== 20000 && task.status_code !== 40102) {
    throw new Error(`DataForSEO ${path}: ${task.status_message}`);
  }
  return { result: task.result?.[0] ?? null, cost: task.cost ?? 0 };
}

export type DomainSeo = {
  domain: string;
  organic: {
    keywords: number;
    etv: number;
    top3: number;
    top10: number;
    trafficCost: number;
  } | null;
  backlinks: {
    rank: number;
    backlinks: number;
    referringDomains: number;
    referringMainDomains: number;
    spamScore: number | null;
    brokenBacklinks: number | null;
  } | null;
  openPageRank: { score: number; globalRank: number | null } | null;
  ahrefs: { domainRating: number } | null;
  cost: number;
  errors: string[];
};

type OrganicMetrics = {
  count?: number;
  etv?: number;
  pos_1?: number;
  pos_2_3?: number;
  pos_4_10?: number;
  estimated_paid_traffic_cost?: number;
};

/** Main Labs language per location, used when the configured language isn't supported there. */
const LOCATION_LANGUAGE: Record<number, string> = {
  2840: "en", 2826: "en", 2036: "en", 2124: "en", 2372: "en", 2554: "en",
  2250: "fr", 2056: "fr", 2756: "de", 2276: "de", 2040: "de",
  2724: "es", 2484: "es", 2032: "es", 2380: "it", 2528: "nl", 2620: "pt", 2076: "pt",
  2616: "pl", 2752: "sv", 2208: "da", 2578: "nb", 2246: "fi",
};

/** Labs call with the configured location/language; retries with the location's main language when Labs rejects the pair. */
async function dfsLabs<T>(c: DataForSeoCreds, path: string, body: Record<string, unknown>): Promise<{ result: T | null; cost: number }> {
  const base = { ...body, location_code: c.locationCode };
  try {
    return await dfs<T>(c, path, { ...base, language_code: c.languageCode });
  } catch (e) {
    // Labs only supports some languages per location (e.g. France = fr only). language_code is required.
    const fallback = LOCATION_LANGUAGE[c.locationCode];
    if (!/language_code/.test(errorMessage(e))) throw e;
    if (!fallback || fallback === c.languageCode) {
      throw new Error(`${errorMessage(e)} — set a language supported for location ${c.locationCode} in Settings → DataForSEO`);
    }
    return dfs<T>(c, path, { ...base, language_code: fallback });
  }
}

async function organicOverview(c: DataForSeoCreds, domain: string) {
  const { result, cost } = await dfsLabs<{ items?: { metrics?: { organic?: OrganicMetrics } }[] }>(
    c,
    "/dataforseo_labs/google/domain_rank_overview/live",
    { target: domain },
  );
  const m = result?.items?.[0]?.metrics?.organic ?? {};
  const top3 = (m.pos_1 ?? 0) + (m.pos_2_3 ?? 0);
  return {
    cost,
    organic: {
      keywords: m.count ?? 0,
      etv: m.etv ?? 0,
      top3,
      top10: top3 + (m.pos_4_10 ?? 0),
      trafficCost: m.estimated_paid_traffic_cost ?? 0,
    },
  };
}

async function backlinksSummary(c: DataForSeoCreds, domain: string) {
  const { result, cost } = await dfs<{
    rank?: number;
    backlinks?: number;
    referring_domains?: number;
    referring_main_domains?: number;
    backlinks_spam_score?: number;
    broken_backlinks?: number;
  }>(c, "/backlinks/summary/live", {
    target: domain,
    include_subdomains: true,
    rank_scale: "one_hundred",
  });
  return {
    cost,
    backlinks: {
      rank: result?.rank ?? 0,
      backlinks: result?.backlinks ?? 0,
      referringDomains: result?.referring_domains ?? 0,
      referringMainDomains: result?.referring_main_domains ?? 0,
      spamScore: result?.backlinks_spam_score ?? null,
      brokenBacklinks: result?.broken_backlinks ?? null,
    },
  };
}

async function openPageRank(apiKey: string, domain: string) {
  const u = new URL("https://openpagerank.com/api/v1.0/getPageRank");
  u.searchParams.append("domains[]", domain);
  const { data } = await fetchJson<{
    response?: { status_code: number; page_rank_decimal?: number | string; rank?: string | number | null }[];
  }>(u, { headers: { "API-OPR": apiKey }, label: "Open PageRank" });
  const r = data.response?.[0];
  if (!r || r.status_code !== 200) return null;
  const rank = r.rank == null ? null : Number(r.rank);
  return { score: Number(r.page_rank_decimal ?? 0), globalRank: Number.isFinite(rank) ? rank : null };
}

async function ahrefsDomainRating(apiKey: string, domain: string) {
  const u = new URL("https://api.ahrefs.com/v3/public/domain-rating-free");
  u.searchParams.set("target", domain);
  u.searchParams.set("output", "json");
  const { data } = await fetchJson<{ domain_rating?: { domain_rating?: number } | number }>(u, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    label: "Ahrefs",
  });
  const dr = typeof data.domain_rating === "number" ? data.domain_rating : data.domain_rating?.domain_rating;
  return typeof dr === "number" && Number.isFinite(dr) ? { domainRating: dr } : null;
}

export async function fetchDomainSeo(domain: string): Promise<DomainSeo> {
  const [dfsCreds, opr, ahrefs] = await Promise.all([getDataForSeoCreds(), getOpenPageRankCreds(), getAhrefsCreds()]);
  if (!dfsCreds && !opr && !ahrefs) throw new Error("No SEO data provider connected (DataForSEO, Open PageRank or Ahrefs)");

  const out: DomainSeo = { domain, organic: null, backlinks: null, openPageRank: null, ahrefs: null, cost: 0, errors: [] };
  const jobs: Promise<void>[] = [];
  if (dfsCreds) {
    jobs.push(
      organicOverview(dfsCreds, domain)
        .then((r) => {
          out.organic = r.organic;
          out.cost += r.cost;
        })
        .catch((e) => void out.errors.push(String(e instanceof Error ? e.message : e))),
    );
    if (dfsCreds.backlinks) {
      jobs.push(
        backlinksSummary(dfsCreds, domain)
          .then((r) => {
            out.backlinks = r.backlinks;
            out.cost += r.cost;
          })
          .catch((e) => void out.errors.push(String(e instanceof Error ? e.message : e))),
      );
    }
  }
  if (opr) {
    jobs.push(
      openPageRank(opr.apiKey, domain)
        .then((r) => void (out.openPageRank = r))
        .catch((e) => void out.errors.push(String(e instanceof Error ? e.message : e))),
    );
  }
  if (ahrefs) {
    jobs.push(
      ahrefsDomainRating(ahrefs.apiKey, domain)
        .then((r) => void (out.ahrefs = r))
        .catch((e) => void out.errors.push(String(e instanceof Error ? e.message : e))),
    );
  }
  await Promise.all(jobs);
  return out;
}

// ─── DataForSEO history, competitors, keywords ──────────────────────────────

async function dfsCreds(): Promise<DataForSeoCreds> {
  const c = await getDataForSeoCreds();
  if (!c) throw new Error("DataForSEO is not connected");
  return c;
}

export type BacklinkDay = {
  date: string;
  newBacklinks: number;
  lostBacklinks: number;
  newReferringDomains: number;
  lostReferringDomains: number;
};

const isDateFromError = (e: unknown) => /date_from/.test(errorMessage(e));

/**
 * Daily new/lost backlinks and referring domains over the last `daysBack` days.
 * The API rejects some start dates without documenting why: shorter windows are tried until one is accepted
 * (rejected tasks aren't billed).
 */
export async function backlinksNewLost(domain: string, daysBack: number): Promise<{ days: BacklinkDay[]; cost: number; daysBack: number }> {
  const c = await dfsCreds();
  const windows = [daysBack, 365, 180, 90, 30].filter((d, i, a) => d <= daysBack && a.indexOf(d) === i);
  for (const [i, back] of windows.entries()) {
    try {
      return { ...(await backlinksWindow(c, domain, back)), daysBack: back };
    } catch (e) {
      if (!isDateFromError(e) || i === windows.length - 1) throw e;
    }
  }
  throw new Error("unreachable");
}

async function backlinksWindow(c: DataForSeoCreds, domain: string, daysBack: number): Promise<{ days: BacklinkDay[]; cost: number }> {
  const from = new Date(Date.now() - daysBack * 86_400_000).toISOString().slice(0, 10);
  const to = new Date().toISOString().slice(0, 10);
  const { result, cost } = await dfs<{
    items?: {
      date: string;
      new_backlinks?: number;
      lost_backlinks?: number;
      new_referring_domains?: number;
      lost_referring_domains?: number;
    }[];
  }>(c, "/backlinks/timeseries_new_lost_summary/live", {
    target: domain,
    date_from: from,
    date_to: to,
    group_range: "day",
    include_subdomains: true,
  });
  return {
    cost,
    days: (result?.items ?? []).map((i) => ({
      date: i.date.slice(0, 10),
      newBacklinks: i.new_backlinks ?? 0,
      lostBacklinks: i.lost_backlinks ?? 0,
      newReferringDomains: i.new_referring_domains ?? 0,
      lostReferringDomains: i.lost_referring_domains ?? 0,
    })),
  };
}

export type RankMonth = { month: string; keywords: number; etv: number; top10: number };

/** Earliest date historical_rank_overview accepts. */
export const RANK_HISTORY_START = "2020-10-01";

/** Monthly organic keywords / estimated traffic from `dateFrom` (falls back to the API's default 6 months if rejected). */
export async function rankHistory(domain: string, dateFrom: string): Promise<{ months: RankMonth[]; cost: number }> {
  const c = await dfsCreds();
  type R = { items?: { year: number; month: number; metrics?: { organic?: OrganicMetrics } }[] };
  const path = "/dataforseo_labs/google/historical_rank_overview/live";
  const from = dateFrom < RANK_HISTORY_START ? RANK_HISTORY_START : dateFrom;
  let res: { result: R | null; cost: number };
  try {
    res = await dfsLabs<R>(c, path, { target: domain, date_from: from });
  } catch (e) {
    if (!isDateFromError(e)) throw e;
    res = await dfsLabs<R>(c, path, { target: domain });
  }
  const { result, cost } = res;
  return {
    cost,
    months: (result?.items ?? [])
      .map((i) => {
        const o = i.metrics?.organic ?? {};
        return {
          month: `${i.year}-${String(i.month).padStart(2, "0")}-01`,
          keywords: o.count ?? 0,
          etv: o.etv ?? 0,
          top10: (o.pos_1 ?? 0) + (o.pos_2_3 ?? 0) + (o.pos_4_10 ?? 0),
        };
      })
      .sort((a, b) => a.month.localeCompare(b.month)),
  };
}

export type Competitor = { domain: string; sharedKeywords: number; avgPosition: number; keywords: number; etv: number };
export type KeywordGap = {
  keyword: string;
  volume: number | null;
  difficulty: number | null;
  intent: string | null;
  competitor: string;
  competitorRank: number | null;
  competitorUrl: string | null;
};

type LabsKeywordData = {
  keyword?: string;
  keyword_info?: { search_volume?: number | null; cpc?: number | null };
  keyword_properties?: { keyword_difficulty?: number | null };
  search_intent_info?: { main_intent?: string | null };
};

/**
 * Organic competitors (by shared keywords), then keywords the top ones rank for and this domain doesn't.
 * 1 + `gapCompetitors` Labs calls.
 */
export async function competitorsAndGaps(
  domain: string,
  opts: { competitors?: number; gapCompetitors?: number; gapsPerCompetitor?: number } = {},
): Promise<{ competitors: Competitor[]; gaps: KeywordGap[]; cost: number }> {
  const c = await dfsCreds();
  const { competitors: nComp = 10, gapCompetitors = 3, gapsPerCompetitor = 30 } = opts;
  const comp = await dfsLabs<{
    items?: {
      domain: string;
      avg_position?: number;
      intersections?: number;
      full_domain_metrics?: { organic?: OrganicMetrics };
    }[];
  }>(c, "/dataforseo_labs/google/competitors_domain/live", {
    target: domain,
    item_types: ["organic"],
    exclude_top_domains: true,
    limit: nComp + 1,
  });
  let cost = comp.cost;
  const bare = (d: string) => d.replace(/^www\./, "");
  const competitors: Competitor[] = (comp.result?.items ?? [])
    .filter((i) => bare(i.domain) !== bare(domain))
    .slice(0, nComp)
    .map((i) => ({
      domain: i.domain,
      sharedKeywords: i.intersections ?? 0,
      avgPosition: i.avg_position ?? 0,
      keywords: i.full_domain_metrics?.organic?.count ?? 0,
      etv: i.full_domain_metrics?.organic?.etv ?? 0,
    }));

  const gapLists = await Promise.all(
    competitors.slice(0, gapCompetitors).map(async (co) => {
      const r = await dfsLabs<{
        items?: { keyword_data?: LabsKeywordData; first_domain_serp_element?: { rank_group?: number; url?: string } }[];
      }>(c, "/dataforseo_labs/google/domain_intersection/live", {
        target1: co.domain,
        target2: domain,
        intersections: false,
        item_types: ["organic"],
        limit: gapsPerCompetitor,
        order_by: ["keyword_data.keyword_info.search_volume,desc"],
      });
      cost += r.cost;
      return (r.result?.items ?? []).map((i): KeywordGap => ({
        keyword: i.keyword_data?.keyword ?? "",
        volume: i.keyword_data?.keyword_info?.search_volume ?? null,
        difficulty: i.keyword_data?.keyword_properties?.keyword_difficulty ?? null,
        intent: i.keyword_data?.search_intent_info?.main_intent ?? null,
        competitor: co.domain,
        competitorRank: i.first_domain_serp_element?.rank_group ?? null,
        competitorUrl: i.first_domain_serp_element?.url ?? null,
      }));
    }),
  );
  // Same keyword from several competitors: keep the best-ranked one, count how many share it.
  const byKw = new Map<string, KeywordGap & { competitors: number }>();
  for (const g of gapLists.flat()) {
    if (!g.keyword) continue;
    const prev = byKw.get(g.keyword);
    if (!prev) byKw.set(g.keyword, { ...g, competitors: 1 });
    else {
      prev.competitors += 1;
      if ((g.competitorRank ?? 999) < (prev.competitorRank ?? 999)) Object.assign(prev, { ...g, competitors: prev.competitors });
    }
  }
  const gaps = [...byKw.values()].sort((a, b) => b.competitors - a.competitors || (b.volume ?? 0) - (a.volume ?? 0));
  return { competitors, gaps, cost };
}

export type KeywordMetrics = { keyword: string; volume: number | null; difficulty: number | null; intent: string | null; cpc: number | null };

/** Search volume, difficulty and intent for up to 700 keywords in one call (billed per returned keyword). */
export async function keywordOverview(keywords: string[]): Promise<{ rows: KeywordMetrics[]; cost: number }> {
  const c = await dfsCreds();
  const list = [...new Set(keywords.map((k) => k.trim().toLowerCase()).filter(Boolean))].slice(0, 700);
  if (!list.length) return { rows: [], cost: 0 };
  const { result, cost } = await dfsLabs<{ items?: LabsKeywordData[] }>(c, "/dataforseo_labs/google/keyword_overview/live", {
    keywords: list,
  });
  return {
    cost,
    rows: (result?.items ?? []).map((i) => ({
      keyword: i.keyword ?? "",
      volume: i.keyword_info?.search_volume ?? null,
      difficulty: i.keyword_properties?.keyword_difficulty ?? null,
      intent: i.search_intent_info?.main_intent ?? null,
      cpc: i.keyword_info?.cpc ?? null,
    })),
  };
}
