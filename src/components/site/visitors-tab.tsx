import type { SiteReport } from "@/lib/metrics";
import type { SiteInsights } from "@/lib/insights";
import type { Range } from "@/lib/dates";
import { getI18n } from "@/i18n/server";
import { Card, CardHeader, Delta, Empty, Stat } from "../ui";
import { Legend, TimeSeriesChart } from "../chart";
import { NotMapped, RankList, Waiting } from "./common";

export async function VisitorsTab({ r, i, range, syncError }: { r: SiteReport; i: SiteInsights; range: Range; syncError?: string | null }) {
  const { t, f } = await getI18n();
  if (!r.config.posthogProjectId) return <Card><NotMapped what={t.sources.posthog} slug={r.slug} /></Card>;
  if (!r.posthog) return <Card><Waiting source={t.sources.posthog} error={syncError} /></Card>;
  const p = r.posthog;
  const vs = t.period.vsPrevious(range);
  const share = i.searchShare;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Stat label={t.metrics.visitors.label} help={t.metrics.visitors.help} color="var(--c-posthog)" value={f.num(p.visitors)} delta={<Delta cur={p.visitors} prev={p.visitorsPrev} suffix={vs} />} />
        <Stat label={t.metrics.pageviews.label} help={t.metrics.pageviews.help} value={f.num(p.pageviews)} delta={<Delta cur={p.pageviews} prev={p.pageviewsPrev} suffix={vs} />} />
        <Stat
          label={t.metrics.searchShare.label}
          help={t.metrics.searchShare.help}
          color="var(--c-gsc)"
          value={share ? f.pct(share.value, 0) : "—"}
          delta={share ? <Delta cur={share.value} prev={share.prev} suffix={vs} /> : null}
          className="col-span-2 lg:col-span-1"
        />
      </div>

      <Card>
        <CardHeader
          title={t.visitors.chartTitle}
          hint={t.visitors.chartHint}
          right={
            <Legend
              items={[
                { name: t.metrics.visitors.label, color: "var(--c-posthog)" },
                { name: t.metrics.pageviews.label, color: "var(--c-companion)", dashed: true },
              ]}
            />
          }
        />
        <div className="px-3 pb-3">
          <TimeSeriesChart
            dates={p.visitorsSeries.dates}
            series={[
              { name: t.metrics.visitors.label, color: "var(--c-posthog)", values: p.visitorsSeries.values },
              { name: t.metrics.pageviews.label, color: "var(--c-companion)", values: p.pageviewsSeries.values, dashed: true },
            ]}
            height={260}
          />
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={t.visitors.topPages} hint={t.visitors.last28} />
          {r.posthogTopPages?.length ? (
            <RankList rows={r.posthogTopPages.slice(0, 8).map((x) => ({ label: x.key, value: x.visitors }))} valueLabel={t.metrics.visitors.label} />
          ) : (
            <Empty>{t.visitors.noData}</Empty>
          )}
        </Card>
        <Card>
          <CardHeader title={t.visitors.referrers} hint={t.visitors.last28} />
          {r.posthogReferrers?.length ? (
            <RankList
              rows={r.posthogReferrers.slice(0, 8).map((x) => ({ label: x.key === "$direct" ? t.visitors.direct : x.key, value: x.visitors }))}
              valueLabel={t.metrics.visitors.label}
            />
          ) : (
            <Empty>{t.visitors.noData}</Empty>
          )}
        </Card>
      </div>

      {i.pages.length ? (
        <Card>
          <CardHeader title={t.visitors.pagesJoin} hint={t.visitors.pagesJoinHint} />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-[14px]">
              <thead className="text-left text-[13px] text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-5 py-2.5 font-medium">{t.google.page}</th>
                  <th className="whitespace-nowrap px-3 py-2.5 text-right font-medium">{t.metrics.clicks.short}</th>
                  <th className="px-3 py-2.5 text-right font-medium">{t.metrics.visitors.label}</th>
                  <th className="px-5 py-2.5 font-medium">{t.visitors.fromGoogle}</th>
                </tr>
              </thead>
              <tbody>
                {i.pages.map((pg) => (
                  <tr key={pg.path} className="border-b border-border last:border-0 hover:bg-card-hover">
                    <td className="max-w-[260px] truncate px-5 py-3 font-medium" title={pg.path}>
                      {pg.path}
                    </td>
                    <td className="tabular px-3 py-3 text-right">{pg.searchClicks != null ? f.num(pg.searchClicks) : "—"}</td>
                    <td className="tabular px-3 py-3 text-right text-muted-foreground">{pg.visitors != null ? f.num(pg.visitors) : "—"}</td>
                    <td className="px-5 py-3">
                      {pg.searchShare != null ? (
                        <span className="flex items-center gap-2">
                          <span className="h-2 w-24 overflow-hidden rounded-full bg-muted" aria-hidden>
                            <span className="block h-full rounded-full" style={{ width: `${Math.min(1, pg.searchShare) * 100}%`, background: "var(--c-gsc)" }} />
                          </span>
                          <span className="tabular text-[13px] text-muted-foreground">{pg.searchShare > 1 ? `> ${f.pct(1, 0)}` : f.pct(pg.searchShare, 0)}</span>
                        </span>
                      ) : (
                        <span className="text-[13px] text-subtle">{pg.searchClicks == null ? t.visitors.notTopSearch : t.visitors.noVisitorsTracked}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
