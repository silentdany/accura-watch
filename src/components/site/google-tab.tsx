import type { SiteReport } from "@/lib/metrics";
import type { SiteInsights } from "@/lib/insights";
import type { Range } from "@/lib/dates";
import { getI18n } from "@/i18n/server";
import { Card, CardHeader, Delta, Empty, Stat } from "../ui";
import { Legend, TimeSeriesChart } from "../chart";
import { NotMapped, OpportunitiesCard, TopTable, Waiting } from "./common";

export async function GoogleTab({ r, i, range, syncError }: { r: SiteReport; i: SiteInsights; range: Range; syncError?: string | null }) {
  const { t, f } = await getI18n();
  if (!r.config.gscProperty) return <Card><NotMapped what={t.sources.gsc} slug={r.slug} /></Card>;
  if (!r.gsc) return <Card><Waiting source={t.sources.gsc} error={syncError} /></Card>;
  const g = r.gsc;
  const vs = t.period.vsPrevious(range);
  const intents = t.google.intents as Record<string, string>;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label={t.metrics.clicks.label} help={t.metrics.clicks.help} color="var(--c-gsc)" value={f.num(g.clicks)} delta={<Delta cur={g.clicks} prev={g.clicksPrev} suffix={vs} />} />
        <Stat label={t.metrics.impressions.label} help={t.metrics.impressions.help} value={f.num(g.impressions)} delta={<Delta cur={g.impressions} prev={g.impressionsPrev} suffix={vs} />} />
        <Stat label={t.metrics.ctr.label} help={t.metrics.ctr.help} value={f.pct(g.ctr, 1)} delta={<Delta cur={g.ctr} prev={g.ctrPrev} suffix={vs} />} />
        <Stat
          label={t.metrics.position.label}
          help={t.metrics.position.help}
          value={f.dec(g.position, 1)}
          delta={<Delta cur={g.position} prev={g.positionPrev} invert mode="abs" suffix={vs} />}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title={t.google.chartTitle}
            hint={t.google.chartHint}
            right={
              <Legend
                items={[
                  { name: t.metrics.clicks.label, color: "var(--c-gsc)" },
                  { name: t.metrics.impressions.label, color: "var(--c-companion)", dashed: true },
                ]}
              />
            }
          />
          <div className="px-3 pb-3">
            <TimeSeriesChart
              dates={g.clicksSeries.dates}
              series={[
                { name: t.metrics.clicks.label, color: "var(--c-gsc)", values: g.clicksSeries.values },
                { name: t.metrics.impressions.label, color: "var(--c-companion)", values: g.impressionsSeries.values, dashed: true },
              ]}
              extra={[
                {
                  name: t.metrics.ctr.label,
                  format: "pct",
                  values: g.clicksSeries.values.map((c, k) => (g.impressionsSeries.values[k] ? c / g.impressionsSeries.values[k] : null)),
                },
              ]}
              indexed
              height={280}
            />
          </div>
        </Card>
        <Card>
          <CardHeader title={t.google.positionTitle} hint={t.google.positionHint} />
          <div className="px-3 pb-3">
            <TimeSeriesChart
              dates={g.positionSeries.dates}
              series={[{ name: t.metrics.position.label, color: "var(--c-gsc)", values: g.positionSeries.values.map((v) => (Number.isFinite(v) ? v : null)) }]}
              height={280}
              kind="line"
              invertY
              format="position"
            />
          </div>
        </Card>
      </div>

      <OpportunitiesCard ctrGaps={i.ctrGaps} striking={i.strikingDistance} />

      {i.shareOfVoice || i.intentMix.length ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Stat
            label={t.metrics.shareOfVoice.label}
            help={t.metrics.shareOfVoice.help}
            value={i.shareOfVoice ? f.pct(i.shareOfVoice.value, i.shareOfVoice.value < 0.1 ? 1 : 0) : "—"}
          />
          <Card className="lg:col-span-2">
            <CardHeader title={t.google.intentTitle} hint={t.google.intentHint} />
            {i.intentMix.length ? (
              <ul className="flex flex-col gap-3 px-5 pb-5">
                {i.intentMix.map((m) => (
                  <li key={m.intent} className="grid grid-cols-[minmax(0,11rem)_1fr_auto] items-center gap-3 text-[14px]">
                    <span className="truncate">{intents[m.intent] ?? m.intent}</span>
                    <span className="h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                      <span className="block h-full rounded-full" style={{ width: `${m.share * 100}%`, background: "var(--c-gsc)" }} />
                    </span>
                    <span className="tabular w-12 text-right font-medium">{f.pct(m.share, 0)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>{t.opportunities.nothing}</Empty>
            )}
          </Card>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title={t.google.topQueries} hint={t.google.vsPrev28} />
          {r.gscTopQueries?.rows.length ? <TopTable rows={r.gscTopQueries.rows} kind="query" /> : <Empty>{t.google.noQueries}</Empty>}
        </Card>
        <Card>
          <CardHeader title={t.google.topPages} hint={t.google.vsPrev28} />
          {r.gscTopPages?.rows.length ? <TopTable rows={r.gscTopPages.rows} kind="page" /> : <Empty>{t.google.noPages}</Empty>}
        </Card>
      </div>
    </div>
  );
}
