import { errorMessage, fetchJson } from "@/lib/http";
import { getAhrefsCreds, getOpenPageRankCreds, getOpenSeoCreds } from "@/lib/integrations";
import { collectOpenSeo } from "@/lib/providers/openseo";

/**
 * Domain SEO:
 * - OpenSEO hosted account when connected (one overview + one backlink summary,
 *   stopped by the monthly cap).
 * - Open PageRank (free): 0–10 authority score.
 * - Ahrefs free Domain Rating endpoint (free APIv3 key, no API units).
 */

export type BacklinkDay = {
  date: string;
  newBacklinks: number;
  lostBacklinks: number;
  newReferringDomains: number;
  lostReferringDomains: number;
};

export type DomainSeo = {
  domain: string;
  organic: {
    keywords: number | null;
    etv: number | null;
    top3: number | null;
    top10: number | null;
    trafficCost: number | null;
  } | null;
  backlinks: {
    /** Null from OpenSEO: their rank is not on the 0–100 scale this chart uses. */
    rank: number | null;
    backlinks: number | null;
    referringDomains: number | null;
    referringMainDomains: number | null;
    spamScore: number | null;
    brokenBacklinks: number | null;
  } | null;
  /** Daily new/lost series included in an OpenSEO backlinks overview. */
  backlinkDays: BacklinkDay[];
  openPageRank: { score: number; globalRank: number | null } | null;
  ahrefs: { domainRating: number } | null;
  cost: number;
  errors: string[];
};

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
  const [openseo, opr, ahrefs] = await Promise.all([getOpenSeoCreds(), getOpenPageRankCreds(), getAhrefsCreds()]);
  if (!openseo && !opr && !ahrefs) {
    throw new Error("No SEO data provider connected (OpenSEO, Open PageRank or Ahrefs)");
  }

  const out: DomainSeo = { domain, organic: null, backlinks: null, backlinkDays: [], openPageRank: null, ahrefs: null, cost: 0, errors: [] };
  const jobs: Promise<void>[] = [];
  if (openseo) {
    jobs.push(
      collectOpenSeo(domain)
        .then((r) => {
          out.organic = r.organic;
          out.backlinks = r.backlinks;
          out.backlinkDays = r.backlinkDays;
          out.cost += r.cost;
          out.errors.push(...r.errors);
        })
        .catch((e) => void out.errors.push(errorMessage(e))),
    );
  }
  if (opr) {
    jobs.push(
      openPageRank(opr.apiKey, domain)
        .then((r) => void (out.openPageRank = r))
        .catch((e) => void out.errors.push(errorMessage(e))),
    );
  }
  if (ahrefs) {
    jobs.push(
      ahrefsDomainRating(ahrefs.apiKey, domain)
        .then((r) => void (out.ahrefs = r))
        .catch((e) => void out.errors.push(errorMessage(e))),
    );
  }
  await Promise.all(jobs);
  return out;
}
