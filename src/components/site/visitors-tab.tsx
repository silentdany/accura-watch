import { Fragment } from "react";
import type { SiteReport } from "@/lib/metrics";
import type { PageJoin, SiteInsights } from "@/lib/insights";
import type { Range } from "@/lib/dates";
import type { Format, Messages } from "@/i18n";
import { getI18n } from "@/i18n/server";
import { Card, CardHeader, Delta, Empty, Stat } from "../ui";
import { Legend, TimeSeriesChart } from "../chart";
import { NotMapped, RankList, Waiting } from "./common";

function pageStory(pg: PageJoin, t: Messages, f: Format): string {
  const quote = (x: string) => (f.locale === "fr" ? `« ${x} »` : `“${x}”`);
  const bits: string[] = [];
  const lowGoogle = pg.visitors != null && pg.visitors >= 10 && (pg.searchClicks == null || pg.searchClicks / pg.visitors < 0.05);
  if (lowGoogle) bits.push(t.visitors.almostNoGoogle);
  else if (pg.topQuery) bits.push(t.visitors.topQuery(quote(pg.topQuery.query)));
  if (pg.topReferrer) {
    const name = pg.topReferrer.key === "$direct" || pg.topReferrer.key === "" ? t.visitors.direct : pg.topReferrer.key;
    bits.push(t.visitors.topReferrer(name));
  }
  if (pg.issues > 0) bits.push(t.visitors.pageIssues(f.num(pg.issues)));
  return bits.join(" ");
}

export async function VisitorsTab({ r, i, range, syncError }: { r: SiteReport; i: SiteInsights; range: Range; syncError?: string | null }) {
  const { t, f } = await getI18n();
  if (!r.config.posthogProjectId) return <Card><NotMapped what={t.sources.posthog} slug={r.slug} /></Card>;
  if (!r.posthog) return <Card><Waiting source={t.sources.posthog} error={syncError} /></Card>;
  const p = r.posthog;
  const vs = t.period.vsPrevious(range);
  const share = i.searchShare;
  const breakdown = r.posthogReferrersByDay?.some((rows) => rows.length)
    ? r.posthogReferrersByDay.map((rows) => rows.map((row) => ({ name: row.key === "$direct" ? t.visitors.direct : row.key, value: row.visitors })))
    : undefined;

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
            breakdown={breakdown}
            breakdownLabel={t.visitors.thatDay}
            marks={r.downMinutes?.map((minutes) => (minutes != null && minutes > 0 ? t.visitors.downMark(f.num(minutes)) : null))}
            height={260}
          />
        </div>
      </Card>

      {i.origins28 ? (
        <Card>
          <CardHeader title={t.visitors.originsTitle} hint={t.visitors.originsHint} dot="var(--c-posthog)" />
          <div className="px-5 pb-5">
            <OriginBar google={i.origins28.google} direct={i.origins28.direct} other={i.origins28.other} labels={[t.visitors.originsGoogle, t.visitors.originsDirect, t.visitors.originsOther]} />
            <ul className="mt-3 grid grid-cols-1 gap-2 text-[14px] sm:grid-cols-3">
              {(
                [
                  [t.visitors.originsGoogle, i.origins28.google, 1],
                  [t.visitors.originsDirect, i.origins28.direct, 0.55],
                  [t.visitors.originsOther, i.origins28.other, 0.28],
                ] as const
              ).map(([label, value, opacity]) => (
                <li key={label} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: "var(--c-posthog)", opacity }} aria-hidden />
                  <span>{label}</span>
                  <span className="tabular font-medium">{f.num(value)}</span>
                </li>
              ))}
            </ul>
            {i.origins28.searchClicks != null ? (
              <p className="mt-3 text-[13px] text-muted-foreground">{t.visitors.originsCompare(f.num(i.origins28.searchClicks), f.num(i.origins28.google))}</p>
            ) : null}
            <p className="mt-1 text-[13px] text-subtle">{t.visitors.originsMain}</p>
          </div>
        </Card>
      ) : null}

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
                {i.pages.map((pg) => {
                  const story = pageStory(pg, t, f);
                  return (
                    <Fragment key={pg.path}>
                      <tr className={story ? "hover:bg-card-hover" : "border-b border-border last:border-0 hover:bg-card-hover"}>
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
                      {story ? (
                        <tr className="border-b border-border last:border-0">
                          <td colSpan={4} className="px-5 pb-3 text-[13px] leading-snug text-muted-foreground">
                            {story}
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function OriginBar({ google, direct, other, labels }: { google: number; direct: number; other: number; labels: [string, string, string] }) {
  const total = google + direct + other;
  const parts = [
    [google, 1, labels[0]],
    [direct, 0.55, labels[1]],
    [other, 0.28, labels[2]],
  ] as const;
  return (
    <div className="flex h-3 overflow-hidden rounded-full bg-muted" role="img" aria-label={parts.map(([value, , label]) => `${label} ${value}`).join(", ")}>
      {total > 0
        ? parts.map(([value, opacity, label]) =>
            value > 0 ? <span key={label} style={{ width: `${(value / total) * 100}%`, background: "var(--c-posthog)", opacity }} /> : null,
          )
        : null}
    </div>
  );
}
