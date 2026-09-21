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

/** Overview KPIs + health + incidents from MetricSnapshot (no mocks). */
export async function loadDashboardData(): Promise<DashboardData> {
  const [
    healthUp,
    healthLatency,
    sentryUnresolved,
    posthogStub,
    gscStub,
    ahrefsStub,
    sites,
    recentBad,
    lastAny,
  ] = await Promise.all([
    latest("health", "up"),
    latest("health", "latency_ms"),
    latest("sentry", "unresolved"),
    latest("posthog", "stub"),
    latest("gsc", "stub"),
    latest("ahrefs", "stub"),
    prisma.site.findMany({ where: { active: true }, orderBy: { slug: "asc" } }),
    prisma.metricSnapshot.findMany({
      where: {
        OR: [
          { source: "health", key: "up", value: 0 },
          { source: "sentry", key: "unresolved", value: { gt: 0 } },
          { source: "sentry", key: "unresolved", valueText: "error" },
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

  const sentryConfigured =
    sentryUnresolved != null &&
    sentryUnresolved.valueText !== "not configured";
  const sentryCount = sentryUnresolved?.value;
  const sentryTone: KpiCardProps["tone"] = !sentryConfigured
    ? "default"
    : sentryUnresolved?.valueText === "error" ||
        (typeof sentryCount === "number" && sentryCount > 0)
      ? "warn"
      : "good";

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
      value: sentryConfigured
        ? String(sentryCount ?? sentryUnresolved?.valueText ?? "-")
        : "-",
      hint: sentryConfigured
        ? `Unresolved | ${ago(sentryUnresolved!.collectedAt)}`
        : "Not configured (SENTRY_*)",
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
      value: "-",
      hint: gscStub ? `Stub | ${ago(gscStub.collectedAt)}` : "Not configured",
      tone: "default",
    },
    {
      id: "ahrefs",
      label: "Ahrefs DR",
      value: "-",
      hint: ahrefsStub
        ? `Stub | ${ago(ahrefsStub.collectedAt)}`
        : "Not configured",
      tone: "default",
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
