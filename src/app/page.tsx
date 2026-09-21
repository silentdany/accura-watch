import { Shell } from "@/components/shell";
import { KpiCard, type KpiCardProps } from "@/components/kpi-card";
import { WATCHED_SITES } from "@/lib/sites";
import { listConnectors } from "@/lib/connectors/registry";

/** Order Spec: Health+Sentry → PostHog → GSC → Ahrefs DR */
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

const MOCK_INCIDENTS = [
  {
    id: "1",
    site: "Watch",
    summary: "Latency spike /api/cron/collect",
    severity: "warn" as const,
    when: "12 min ago",
  },
  {
    id: "2",
    site: "Accura",
    summary: "Sentry: unhandled rejection ContactForm",
    severity: "bad" as const,
    when: "1 h ago",
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
            Health live stub · Sentry → PostHog → GSC → Ahrefs (placeholders).
          </p>
        </div>
        <p className="font-mono text-[11px] text-muted-foreground">
          {connectors.map((c) => c.id).join(" · ")}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {MOCK_KPIS.map((kpi) => (
          <KpiCard key={kpi.id} {...kpi} />
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section
          id="health-list"
          className="rounded-[var(--radius-md)] border border-border bg-card p-4"
        >
          <h3 className="text-sm font-medium text-foreground">Health</h3>
          <ul className="mt-3 divide-y divide-border">
            {WATCHED_SITES.map((site) => (
              <li
                key={site.slug}
                id={`site-${site.slug}`}
                className="flex items-center justify-between gap-3 py-3 text-sm"
              >
                <div>
                  <p className="font-medium text-foreground">{site.name}</p>
                  <p className="text-xs text-muted-foreground">{site.url}</p>
                </div>
                <span
                  className={
                    site.status === "up"
                      ? "text-primary"
                      : site.status === "degraded"
                        ? "text-warning"
                        : "text-destructive"
                  }
                >
                  {site.status}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-[var(--radius-md)] border border-border bg-card p-4">
          <h3 className="text-sm font-medium text-foreground">Incidents</h3>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="pb-2 font-medium">Site</th>
                  <th className="pb-2 font-medium">Summary</th>
                  <th className="pb-2 font-medium">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {MOCK_INCIDENTS.map((row) => (
                  <tr key={row.id}>
                    <td className="py-2.5 text-foreground">{row.site}</td>
                    <td
                      className={
                        row.severity === "bad"
                          ? "py-2.5 text-destructive"
                          : "py-2.5 text-warning"
                      }
                    >
                      {row.summary}
                    </td>
                    <td className="py-2.5 font-mono text-xs text-muted-foreground">
                      {row.when}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </Shell>
  );
}
