import { Shell } from "@/components/shell";
import { KpiCard, type KpiCardProps } from "@/components/kpi-card";
import { listConnectors } from "@/lib/connectors/registry";

const MOCK_KPIS: KpiCardProps[] = [
  {
    id: "health",
    label: "Health",
    value: "99.8%",
    hint: "Uptime · last 24h (mock)",
    tone: "good",
  },
  {
    id: "sentry",
    label: "Sentry",
    value: "3",
    hint: "Unresolved issues (mock)",
    tone: "warn",
  },
  {
    id: "posthog",
    label: "PostHog",
    value: "12.4k",
    hint: "Events · last 7d (mock)",
    tone: "default",
  },
  {
    id: "gsc",
    label: "GSC",
    value: "48.2k",
    hint: "Clicks · last 28d (mock)",
    tone: "good",
  },
  {
    id: "ahrefs",
    label: "Ahrefs DR",
    value: "42",
    hint: "Domain Rating (mock)",
    tone: "default",
  },
];

export default function HomePage() {
  const connectors = listConnectors();

  return (
    <Shell title="Overview">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Site pulse
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Five connectors registered — health is a live stub; others return
            placeholder snapshots until credentials land.
          </p>
        </div>
        <p className="font-mono text-[11px] text-muted-foreground">
          {connectors.map((c) => c.id).join(" · ")}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {MOCK_KPIS.map((kpi) => (
          <KpiCard key={kpi.id} {...kpi} />
        ))}
      </div>

      <section className="mt-8 rounded-[var(--radius-md)] border border-border bg-card p-5">
        <h3 className="text-sm font-medium text-foreground">Cron collect</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Hit{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-primary">
            GET /api/cron/collect
          </code>{" "}
          with{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
            Authorization: Bearer $CRON_SECRET
          </code>
          . Wire Vercel Cron via{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
            vercel.json
          </code>
          .
        </p>
      </section>
    </Shell>
  );
}
