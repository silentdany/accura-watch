const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const full = new Intl.NumberFormat("en");

export function fmtNum(n: number | null | undefined, opts: { compact?: boolean } = {}): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (opts.compact === false || Math.abs(n) < 10_000) return full.format(Math.round(n));
  return compact.format(n);
}

export function fmtPct(n: number | null | undefined, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}

export function fmtPos(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toFixed(1);
}

export function fmtMs(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n >= 1000 ? `${(n / 1000).toFixed(1)} s` : `${Math.round(n)} ms`;
}

export function fmtDate(ymd: string): string {
  const d = new Date(ymd.length === 10 ? `${ymd}T00:00:00Z` : ymd);
  return d.toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** Relative change; null when growing from zero. */
export function pctChange(cur: number, prev: number): number | null {
  if (!prev) return cur ? null : 0;
  return (cur - prev) / prev;
}

/** Best available authority score: Ahrefs DR > DataForSEO rank (both /100) > Open PageRank (/10). */
export function authority(
  seo: { ahrefsDr: number | null; rank: number | null; opr: number | null } | null | undefined,
): { value: number; label: "DR" | "Rank" | "OPR"; text: string } | null {
  if (!seo) return null;
  if (seo.ahrefsDr != null) return { value: seo.ahrefsDr, label: "DR", text: String(Math.round(seo.ahrefsDr)) };
  if (seo.rank != null) return { value: seo.rank, label: "Rank", text: String(Math.round(seo.rank)) };
  if (seo.opr != null) return { value: seo.opr * 10, label: "OPR", text: seo.opr.toFixed(1) };
  return null;
}
