import type { Alert, SiteRow } from "@/lib/metrics";
import { pctChange } from "@/lib/format";

export type Verdict = "down" | "attention" | "growing" | "declining" | "stable" | "noData";

/** One-word health of a site for people who don't read charts: offline > warnings > traffic trend. */
export function siteVerdict(row: SiteRow, alerts: Alert[]): Verdict {
  if (row.health.status === "down") return "down";
  if (alerts.some((a) => a.site === row.slug && a.severity !== "info")) return "attention";
  const trend = row.gsc ? pctChange(row.gsc.clicks, row.gsc.clicksPrev) : row.posthog ? pctChange(row.posthog.visitors, row.posthog.visitorsPrev) : null;
  if (trend == null) return row.gsc || row.posthog ? "stable" : "noData";
  if (trend >= 0.1) return "growing";
  if (trend <= -0.1) return "declining";
  return "stable";
}

export const VERDICT_TONE: Record<Verdict, "good" | "bad" | "warning" | "neutral" | "info"> = {
  down: "bad",
  attention: "warning",
  growing: "good",
  declining: "warning",
  stable: "neutral",
  noData: "neutral",
};
