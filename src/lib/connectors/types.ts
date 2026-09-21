import type { SiteId } from "@/lib/sites";

export type HealthStatus = "up" | "down" | "degraded" | "unknown";

export type HealthMetrics = {
  status: HealthStatus;
  statusCode: number | null;
  latencyMs: number | null;
  checkedAt: string; // ISO
  detail?: string;
};

export type MetricSnapshot = {
  siteId: SiteId;
  health: HealthMetrics;
};

/** Connector contract — real providers implement this. */
export type MetricsConnector = {
  fetchMetrics(siteId: SiteId): Promise<MetricSnapshot>;
};
