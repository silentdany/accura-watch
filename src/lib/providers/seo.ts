import { errorMessage, fetchJson } from "@/lib/http";
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

async function organicOverview(c: DataForSeoCreds, domain: string) {
  type Overview = { items?: { metrics?: { organic?: OrganicMetrics } }[] };
  const path = "/dataforseo_labs/google/domain_rank_overview/live";
  const base = { target: domain, location_code: c.locationCode };
  let res: { result: Overview | null; cost: number };
  try {
    res = await dfs<Overview>(c, path, { ...base, language_code: c.languageCode });
  } catch (e) {
    // Labs only supports some languages per location (e.g. France = fr only): fall back to the location's default.
    if (!/language_code/.test(errorMessage(e))) throw e;
    res = await dfs<Overview>(c, path, base);
  }
  const { result, cost } = res;
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
