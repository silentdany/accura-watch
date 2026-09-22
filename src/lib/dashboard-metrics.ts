import { prisma } from "@/lib/prisma";
import type { KpiCardProps } from "@/components/kpi-card";
import type { SiteStatus } from "@/lib/sites";

export type HealthRow = {
  slug: string;
  name: string;
  url: string;
  status: SiteStatus;
};

export type IncidentRow = {
  id: string;
  site: string;
  summary: string;
  severity: "warn" | "bad";
  when: string;
};

export type DashboardData = {
  kpis: KpiCardProps[];
  healthRows: HealthRow[];
  incidents: IncidentRow[];
  lastSync: Date | null;
  connectorLabels: string[];
};

function ago(date: Date): string {
  const sec = Math.round((Date.now() - date.getTime()) / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 48) return `${hr} h ago`;
  return date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusFromUp(value: number | null, text: string | null): SiteStatus {
  if (text === "up" || value === 1) return "up";
  if (text === "degraded") return "degraded";
  if (text === "down" || value === 0) return "down";
  return "unknown";
}

async function latest(source: string, key: string) {
  return prisma.metricSnapshot.findFirst({
    where: { source, key },
    orderBy: { collectedAt: "desc" },
    include: { site: true },
  });
}

type Agg = {
  total: number | null;
  average: number | null;
  configuredSites: number;
  latestAt: Date | null;
  anyError: boolean;
  impressionsSum: number | null;
};

/** Latest numeric metric per active site; skip / not configured excluded. */
async function aggregateNumeric(
  source: string,
  key: string,
  mode: "sum" | "avg",
): Promise<Agg> {
  const sites = await prisma.site.findMany({
    where: { active: true },
    select: { id: true },
  });

  let sum = 0;
  let numericSites = 0;
  let configuredSites = 0;
  let latestAt: Date | null = null;
  let anyError = false;

  for (const site of sites) {
    const snap = await prisma.metricSnapshot.findFirst({
      where: { siteId: site.id, source, key },
      orderBy: { collectedAt: "desc" },
    });
    if (!snap) continue;

    const text = snap.valueText ?? "";
    if (text === "skipped" || text === "not configured") continue;

    if (text === "error") {
      anyError = true;
      configuredSites += 1;
      if (!latestAt || snap.collectedAt > latestAt) latestAt = snap.collectedAt;
      continue;
    }

    if (typeof snap.value === "number" && Number.isFinite(snap.value)) {
      sum += snap.value;
      numericSites += 1;
      configuredSites += 1;
      if (!latestAt || snap.collectedAt > latestAt) latestAt = snap.collectedAt;
    }
  }

  const average = numericSites > 0 && mode === "avg" ? sum / numericSites : null;
  const total = numericSites > 0 && mode === "sum" ? sum : null;

  return {
    total: mode === "sum" ? total : numericSites > 0 ? sum : null,
    average,
    configuredSites,
    latestAt,
    anyError,
    impressionsSum: null,
  };
}

/** Latest Sentry unresolved per site that reports a count (skip / not configured excluded). */
async function aggregateSentryUnresolved(): Promise<{
  total: number | null;
  configuredSites: number;
  latestAt: Date | null;
  anyError: boolean;
}> {
  const agg = await aggregateNumeric("sentry", "unresolved", "sum");
  return {
    total: agg.total,
    configuredSites: agg.configuredSites,
    latestAt: agg.latestAt,
    anyError: agg.anyError,
  };
}

async function aggregateGscClicks(): Promise<Agg> {
  const clicks = await aggregateNumeric("gsc", "clicks7d", "sum");
  const impressions = await aggregateNumeric("gsc", "impressions7d", "sum");
  return {
    ...clicks,
    impressionsSum: impressions.total,
  };
}

async function aggregateAhrefsDr(): Promise<Agg> {
  return aggregateNumeric("ahrefs", "dr", "avg");
}

/** Overview KPIs + health + incidents from MetricSnapshot (no mocks). */
export async function loadDashboardData(): Promise<DashboardData> {
  const [
    healthUp,
    healthLatency,
    sentryAgg,
    posthogStub,
    gscAgg,
    ahrefsAgg,
    sites,
    recentBad,
    lastAny,
  ] = await Promise.all([
    latest("health", "up"),
    latest("health", "latency_ms"),
    aggregateSentryUnresolved(),
    latest("posthog", "stub"),
    aggregateGscClicks(),
    aggregateAhrefsDr(),
    prisma.site.findMany({ where: { active: true }, orderBy: { slug: "asc" } }),
    prisma.metricSnapshot.findMany({
      where: {
        OR: [
          { source: "health", key: "up", value: 0 },
          {
            source: "sentry",
            key: "unresolved",
            value: { gt: 0 },
            NOT: {
              valueText: { in: ["skipped", "not configured"] },
            },
          },
          { source: "sentry", key: "unresolved", valueText: "error" },
          { source: "gsc", key: "clicks7d", valueText: "error" },
          { source: "ahrefs", key: "dr", valueText: "error" },
        ],
      },
      orderBy: { collectedAt: "desc" },
      take: 12,
      include: { site: true },
    }),
    prisma.metricSnapshot.findFirst({
      orderBy: { collectedAt: "desc" },
      select: { collectedAt: true },
    }),
  ]);

  const healthTone: KpiCardProps["tone"] =
    healthUp?.value === 1 || healthUp?.valueText === "up"
      ? "good"
      : healthUp
        ? "bad"
        : "default";

  const healthValue =
    healthUp?.valueText ??
    (healthUp?.value === 1 ? "up" : healthUp ? "down" : "-");

  const latencyHint =
    healthLatency?.value != null
      ? `Latency ${Math.round(healthLatency.value)} ms | ${ago(healthLatency.collectedAt)}`
      : healthUp
        ? `Last check ${ago(healthUp.collectedAt)}`
        : "No health snapshot yet - run cron";

  const sentryConfigured = sentryAgg.configuredSites > 0;
  const sentryTone: KpiCardProps["tone"] = !sentryConfigured
    ? "default"
    : sentryAgg.anyError || (sentryAgg.total != null && sentryAgg.total > 0)
      ? "warn"
      : "good";

  const sentryHint = !sentryConfigured
    ? "No Sentry sites (set Site.config.sentryProject)"
    : sentryAgg.anyError
      ? `Error on one or more sites | ${sentryAgg.configuredSites} sites`
      : `Unresolved (sum) | ${sentryAgg.configuredSites} sites` +
        (sentryAgg.latestAt ? ` | ${ago(sentryAgg.latestAt)}` : "");

  const gscConfigured = gscAgg.configuredSites > 0;
  const gscTone: KpiCardProps["tone"] = !gscConfigured
    ? "default"
    : gscAgg.anyError
      ? "warn"
      : "good";
  const gscHint = !gscConfigured
    ? "No GSC sites (set Site.config.gscSiteUrl + GSC_* env)"
    : gscAgg.anyError
      ? `Error on one or more sites | ${gscAgg.configuredSites} sites`
      : `Clicks 7d (sum)` +
        (gscAgg.impressionsSum != null
          ? ` | impressions ${Math.round(gscAgg.impressionsSum)}`
          : "") +
        ` | ${gscAgg.configuredSites} sites` +
        (gscAgg.latestAt ? ` | ${ago(gscAgg.latestAt)}` : "");

  const ahrefsConfigured = ahrefsAgg.configuredSites > 0;
  const ahrefsTone: KpiCardProps["tone"] = !ahrefsConfigured
    ? "default"
    : ahrefsAgg.anyError
      ? "warn"
      : "good";
  const ahrefsHint = !ahrefsConfigured
    ? "Set AHREFS_API_KEY for free Domain Rating"
    : ahrefsAgg.anyError
      ? `Error on one or more sites | ${ahrefsAgg.configuredSites} sites`
      : `Avg DR | ${ahrefsAgg.configuredSites} sites` +
        (ahrefsAgg.latestAt ? ` | ${ago(ahrefsAgg.latestAt)}` : "");

  const formatDr = (n: number | null) => {
    if (n == null || !Number.isFinite(n)) return "-";
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
  };

  const kpis: KpiCardProps[] = [
    {
      id: "health",
      label: "Health",
      value: String(healthValue),
      hint: latencyHint,
      tone: healthTone,
    },
    {
      id: "sentry",
      label: "Sentry",
      value: sentryConfigured ? String(sentryAgg.total ?? "-") : "-",
      hint: sentryHint,
      tone: sentryTone,
    },
    {
      id: "posthog",
      label: "PostHog",
      value: "-",
      hint: posthogStub
        ? `Stub | ${ago(posthogStub.collectedAt)}`
        : "Not configured",
      tone: "default",
    },
    {
      id: "gsc",
      label: "GSC",
      value:
        gscConfigured && gscAgg.total != null
          ? String(Math.round(gscAgg.total))
          : "-",
      hint: gscHint,
      tone: gscTone,
    },
    {
      id: "ahrefs",
      label: "Ahrefs DR",
      value: ahrefsConfigured ? formatDr(ahrefsAgg.average) : "-",
      hint: ahrefsHint,
      tone: ahrefsTone,
    },
  ];

  const healthRows: HealthRow[] = [];
  for (const site of sites) {
    const snap = await prisma.metricSnapshot.findFirst({
      where: { siteId: site.id, source: "health", key: "up" },
      orderBy: { collectedAt: "desc" },
    });
    healthRows.push({
      slug: site.slug,
      name: site.name,
      url: site.url,
      status: statusFromUp(snap?.value ?? null, snap?.valueText ?? null),
    });
  }

  const incidents: IncidentRow[] = recentBad.map((row) => {
    const isHealthDown = row.source === "health" && row.key === "up";
    let summary: string;
    if (isHealthDown) {
      const err =
        row.meta &&
        typeof row.meta === "object" &&
        "error" in (row.meta as object)
          ? String((row.meta as { error?: string }).error ?? "")
          : "";
      summary = err ? `Health down | ${err}` : "Health down";
    } else if (row.source === "gsc") {
      const err =
        row.meta &&
        typeof row.meta === "object" &&
        "error" in (row.meta as object)
          ? String((row.meta as { error?: string }).error ?? "")
          : "";
      summary = err ? `GSC error | ${err}` : `GSC error: ${row.valueText ?? "?"}`;
    } else if (row.source === "ahrefs") {
      const err =
        row.meta &&
        typeof row.meta === "object" &&
        "error" in (row.meta as object)
          ? String((row.meta as { error?: string }).error ?? "")
          : "";
      summary = err
        ? `Ahrefs error | ${err}`
        : `Ahrefs error: ${row.valueText ?? "?"}`;
    } else {
      summary = `Sentry unresolved: ${row.value ?? row.valueText ?? "?"}`;
    }
    return {
      id: row.id,
      site: row.site.name,
      summary,
      severity: isHealthDown ? "bad" : "warn",
      when: ago(row.collectedAt),
    };
  });

  return {
    kpis,
    healthRows,
    incidents,
    lastSync: lastAny?.collectedAt ?? null,
    connectorLabels: ["health", "sentry", "posthog", "gsc", "ahrefs"],
  };
}
