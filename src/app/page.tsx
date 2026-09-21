import { HealthCard } from "@/components/health-card";
import { stubConnector } from "@/lib/connectors/stub";
import { SITES } from "@/lib/sites";
import { getOperatorEmail, isAuthConfigured } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function WatchHomePage() {
  const snapshots = await Promise.all(
    SITES.map((site) => stubConnector.fetchMetrics(site.id)),
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted">
            Accura Watch
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-muted">
            Operator: {getOperatorEmail()}
            {isAuthConfigured() ? " · auth ready" : " · auth stub (set BETTER_AUTH_SECRET)"}
          </p>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        {SITES.map((site) => {
          const snap = snapshots.find((s) => s.siteId === site.id);
          return (
            <HealthCard
              key={site.id}
              siteName={site.name}
              siteUrl={site.url}
              health={
                snap?.health ?? {
                  status: "unknown",
                  statusCode: null,
                  latencyMs: null,
                  checkedAt: new Date().toISOString(),
                }
              }
            />
          );
        })}
      </section>

      <p className="mt-8 text-xs text-muted">
        V1 scaffold · connectors + snapshots + cron stubs · shadcn Card lean
      </p>
    </div>
  );
}
