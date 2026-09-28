import type { SiteReport } from "@/lib/metrics";
import type { SiteInsights } from "@/lib/insights";
import type { Range } from "@/lib/dates";
import { getI18n } from "@/i18n/server";
import { Card, CardHeader, Delta, Empty, Stat } from "../ui";
import { TimeSeriesChart } from "../chart";
import { NotMapped, Waiting } from "./common";

export async function HealthTab({ r, i, range, syncError }: { r: SiteReport; i: SiteInsights; range: Range; syncError?: string | null }) {
  const { t, f } = await getI18n();
  const h = r.health;
  const vs = t.period.vsPrevious(range);
  const latencyTone = h.latencyMs == null ? "" : h.latencyMs < 500 ? "text-good" : h.latencyMs < 1500 ? "text-warning" : "text-destructive";

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          label={t.metrics.uptime.label}
          help={t.metrics.uptime.help}
          color="var(--c-health)"
          value={<span className={h.status === "down" ? "text-destructive" : ""}>{h.uptime != null ? f.pct(h.uptime, h.uptime === 1 ? 0 : 2) : "—"}</span>}
          footnote={h.status === "down" ? t.status.down : t.period.last(range)}
        />
        <Stat
          label={t.metrics.latency.label}
          help={t.metrics.latency.help}
          value={<span className={latencyTone}>{f.ms(h.latencyMs)}</span>}
          footnote={h.lastCheckedAt ? t.health.checked(f.ago(h.lastCheckedAt)) : t.health.notChecked}
        />
        <Stat
          label={t.metrics.ssl.label}
          help={t.metrics.ssl.help}
          value={<span className={h.sslDaysLeft != null && h.sslDaysLeft < 14 ? "text-warning" : ""}>{h.sslDaysLeft != null ? t.time.days(h.sslDaysLeft) : "—"}</span>}
        />
        <Stat
          label={t.metrics.errorsPer1k.label}
          help={t.metrics.errorsPer1k.help}
          color="var(--c-sentry)"
          value={i.errorsPer1k ? f.dec(i.errorsPer1k.value, 1) : "—"}
          delta={i.errorsPer1k ? <Delta cur={i.errorsPer1k.value} prev={i.errorsPer1k.prev} invert suffix={vs} /> : null}
        />
      </div>

      <Card>
        <CardHeader
          title={t.health.latencyTitle}
          help={t.metrics.latency.help}
          hint={[h.lastCheckedAt ? t.health.checked(f.ago(h.lastCheckedAt)) : t.health.notChecked, h.statusCode ? t.health.httpStatus(h.statusCode) : null, h.error]
            .filter(Boolean)
            .join(" · ")}
          dot="var(--c-health)"
        />
        <div className="px-3 pb-3">
          <TimeSeriesChart
            dates={r.latency.dates}
            series={[{ name: t.metrics.latency.label, color: "var(--c-health)", values: r.latency.values.map((v) => (Number.isFinite(v) ? v : null)) }]}
            height={220}
            kind="line"
            format="ms"
            dateFormat="datetime"
            emptyLabel={t.health.latencyEmpty}
          />
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={t.health.errorsTitle} help={t.metrics.events.help} dot="var(--c-sentry)" />
          {!r.config.sentryProject ? (
            <NotMapped what={t.sources.sentry} slug={r.slug} />
          ) : !r.sentry ? (
            <Waiting source={t.sources.sentry} error={syncError} />
          ) : (
            <div className="px-3 pb-3">
              <TimeSeriesChart
                dates={r.sentry.eventsSeries.dates}
                series={[{ name: t.metrics.events.label, color: "var(--c-sentry)", values: r.sentry.eventsSeries.values }]}
                height={200}
                kind="bar"
                emptyLabel={t.health.noErrors}
              />
            </div>
          )}
        </Card>
        <Card>
          <CardHeader title={t.health.issuesTitle} help={t.metrics.issues.help} />
          {r.sentryIssues?.length ? (
            <ul className="flex flex-col gap-1 px-2 pb-2">
              {r.sentryIssues.slice(0, 8).map((is) => (
                <li key={is.id}>
                  <a href={is.permalink} target="_blank" rel="noreferrer" className="flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted">
                    <span
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${is.level === "error" || is.level === "fatal" ? "bg-destructive" : "bg-warning"}`}
                      aria-label={is.level}
                      role="img"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium" title={is.title}>
                        {is.title}
                      </span>
                      <span className="tabular block text-[13px] text-muted-foreground">{t.health.issueLine(f.num(is.count), f.num(is.userCount), f.ago(is.lastSeen))}</span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>{r.config.sentryProject ? t.health.noIssues : t.site.notMapped(t.sources.sentry)}</Empty>
          )}
        </Card>
      </div>
    </div>
  );
}
