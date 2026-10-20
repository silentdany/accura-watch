/** PostHog referring domains, grouped the way the UI talks about them. */

export type OriginBucket = "google" | "direct" | "other";

export type OriginSplit = { google: number; direct: number; other: number };

/** google.com, google.fr, news.google.co.uk. Not googleapis or tag manager. */
const GOOGLE_HOST = /(^|\.)google\.([a-z]{2,3})(\.[a-z]{2})?$/;

export function referrerBucket(key: string): OriginBucket {
  const raw = key.trim().toLowerCase();
  if (raw === "" || raw === "$direct" || raw === "(direct)" || raw === "direct") return "direct";
  const host = raw.replace(/^https?:\/\//, "").split("/")[0].split(":")[0].replace(/^www\./, "");
  if (host === "google" || GOOGLE_HOST.test(host)) return "google";
  return "other";
}

export function splitOrigins(rows: { key: string; visitors: number }[]): OriginSplit {
  const out: OriginSplit = { google: 0, direct: 0, other: 0 };
  for (const row of rows) {
    if (!Number.isFinite(row.visitors) || row.visitors <= 0) continue;
    out[referrerBucket(row.key)] += row.visitors;
  }
  return out;
}

/**
 * Two counts of the same thing disagree enough to say so.
 * Ratio at least 1.5 either way, and a gap of at least 5.
 */
export function countsDiverge(a: number, b: number): boolean {
  const gap = Math.abs(a - b);
  if (gap < 5) return false;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return lo === 0 ? hi >= 5 : hi / lo >= 1.5;
}
