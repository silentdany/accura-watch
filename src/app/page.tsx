import { Shell } from "@/components/shell";
import { KpiCard } from "@/components/kpi-card";
import { requireSession } from "@/lib/require-session";
import { loadDashboardData } from "@/lib/dashboard-metrics";

export default async function HomePage() {
  const session = await requireSession();
  const data = await loadDashboardData();
  const email = session.user.email;

  return (
    <Shell
      title="Overview"
      userEmail={email}
      sites={data.healthRows}
      lastSync={data.lastSync}
    >
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Site pulse
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Live MetricSnapshot · Health + Sentry · PostHog / GSC / Ahrefs TBD.
          </p>
        </div>
        <p className="font-mono text-[11px] text-muted-foreground">
          {data.connectorLabels.join(" · ")}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {data.kpis.map((kpi) => (
          <KpiCard key={kpi.id} {...kpi} />
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section
          id="health-list"
          className="rounded-[var(--radius-md)] border border-border bg-card p-4"
        >
          <h3 className="text-sm font-medium text-foreground">Health</h3>
          {data.healthRows.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              No sites in DB yet. Seed + run cron.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {data.healthRows.map((site) => (
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
                          : site.status === "down"
                            ? "text-destructive"
                            : "text-muted-foreground"
                    }
                  >
                    {site.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-[var(--radius-md)] border border-border bg-card p-4">
          <h3 className="text-sm font-medium text-foreground">Incidents</h3>
          {data.incidents.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              No recent incidents from snapshots.
            </p>
          ) : (
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
                  {data.incidents.map((row) => (
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
          )}
        </section>
      </div>
    </Shell>
  );
}
