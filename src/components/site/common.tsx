import Link from "next/link";
import { Link2, Sparkles, TriangleAlert } from "lucide-react";
import type { Freshness, TopQueryRow } from "@/lib/metrics";
import type { Correlation, QueryOpportunity } from "@/lib/insights";
import type { Format, Messages } from "@/i18n";
import { getI18n } from "@/i18n/server";
import { Badge, Card, CardHeader, Delta, Empty } from "../ui";
import { ChevronRight } from "lucide-react";
import { CorrelationChart } from "../correlation-chart";

export async function NotMapped({ what, slug }: { what: string; slug: string }) {
  const { t } = await getI18n();
  return (
    <Empty>
      {t.site.notMapped(what)}{" "}
      <Link href={`/sites#${slug}`} className="link font-medium">
        {t.site.mapIt}
      </Link>
    </Empty>
  );
}

export async function Waiting({ source, error }: { source: string; error?: string | null }) {
  const { t } = await getI18n();
  return (
    <Empty>
      {error ? (
        <>
          <span className="font-medium text-destructive">{t.site.syncError}</span> {error}
        </>
      ) : (
        t.site.waiting(source)
      )}
    </Empty>
  );
}

/** Top searches / pages with clicks, impressions, CTR and position, each vs the previous 28 days. */
export async function TopTable({ rows, kind }: { rows: TopQueryRow[]; kind: "query" | "page" }) {
  const { t, f } = await getI18n();
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-[14px]">
        <thead className="text-left text-[13px] text-muted-foreground">
          <tr className="border-b border-border">
            <th className="px-5 py-2.5 font-medium">{kind === "query" ? t.google.query : t.google.page}</th>
            <th className="whitespace-nowrap px-3 py-2.5 text-right font-medium">{t.metrics.clicks.short}</th>
            <th className="whitespace-nowrap px-3 py-2.5 text-right font-medium">{t.metrics.impressions.short}</th>
            <th className="whitespace-nowrap px-3 py-2.5 text-right font-medium">{t.metrics.ctr.short}</th>
            <th className="whitespace-nowrap px-5 py-2.5 text-right font-medium">{t.metrics.position.short}</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 12).map((r) => {
            const label = kind === "page" ? r.key.replace(/^https?:\/\/[^/]+/, "") || "/" : r.key;
            return (
              <tr key={r.key} className="border-b border-border last:border-0 hover:bg-card-hover">
                <td className="max-w-[300px] truncate px-5 py-3 font-medium" title={r.key}>
                  {label}
                </td>
                <td className="px-3 py-3 text-right">
                  <span className="tabular inline-flex items-center justify-end gap-2">
                    {f.num(r.clicks)}
                    <Delta cur={r.clicks} prev={r.prevClicks} />
                  </span>
                </td>
                <td className="tabular px-3 py-3 text-right text-muted-foreground">{f.num(r.impressions)}</td>
                <td className="tabular px-3 py-3 text-right text-muted-foreground">{f.pct(r.ctr, 1)}</td>
                <td className="px-5 py-3 text-right">
                  <span className="tabular inline-flex items-center justify-end gap-2">
                    {f.dec(r.position, 1)}
                    <Delta cur={r.position} prev={r.prevPosition} invert mode="abs" />
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Two-column list (label, number) — top pages, referrers. */
export async function RankList({ rows, valueLabel }: { rows: { label: string; value: number }[]; valueLabel: string }) {
  const { f } = await getI18n();
  rows = [...rows].sort((a, b) => b.value - a.value);
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="flex flex-col gap-1 px-5 pb-5">
      <li className="flex justify-end text-[13px] text-muted-foreground">{valueLabel}</li>
      {rows.map((r) => (
        <li key={r.label} className="relative flex items-center justify-between gap-3 overflow-hidden rounded-md px-2.5 py-2 text-[14px]">
          <span className="absolute inset-y-0 left-0 rounded-md bg-muted" style={{ width: `${(r.value / max) * 100}%` }} aria-hidden />
          <span className="relative min-w-0 truncate" title={r.label}>
            {r.label}
          </span>
          <span className="tabular relative font-medium">{f.num(r.value)}</span>
        </li>
      ))}
    </ul>
  );
}

export function correlationSentence(c: Correlation, t: Messages): string {
  const k = t.correlations;
  if (c.strength === "none") return k.none(k.metric[c.driver], k.metric[c.outcome]);
  const lag = c.lag ? (c.unit === "week" ? t.time.weeks(c.lag) : t.time.days(c.lag)) : "";
  return k.sentence(k.driver[c.driver], k.outcome[c.outcome][c.r > 0 ? "hi" : "lo"], lag);
}

const STRENGTH_TONE = { strong: "info", moderate: "info", weak: "neutral", none: "neutral" } as const;

/** Correlations as readable sentences, strongest first; "no link" results fold into one line. */
export async function CorrelationList({ items, showNone = true, openFirst = true }: { items: Correlation[]; showNone?: boolean; openFirst?: boolean }) {
  const { t, f } = await getI18n();
  // Non-obvious causes first (links, speed, errors): "more visits → more visitors" teaches less.
  const insightful = (c: Correlation) => (["links", "latency", "errors"].includes(c.driver) ? 0 : 1);
  const linked = items.filter((c) => c.strength !== "none").sort((a, b) => insightful(a) - insightful(b));
  const none = items.filter((c) => c.strength === "none");
  if (!items.length) return <Empty>{t.correlations.notEnough}</Empty>;
  return (
    <div className="flex flex-col gap-3 px-5 pb-5">
      {linked.map((c, idx) => (
        <div key={`${c.driver}-${c.outcome}`} className="flex items-start gap-3 rounded-xl bg-muted/70 p-4">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-card text-info shadow-[var(--shadow)]">
            <Link2 className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] leading-snug">{correlationSentence(c, t)}</p>
            <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
              <Badge tone={STRENGTH_TONE[c.strength]}>{t.correlations.strength[c.strength]}</Badge>
              {t.correlations.basedOn(c.unit === "week" ? t.time.weeks(c.days) : t.time.days(c.days))}
              <span className="tabular text-subtle">r = {f.dec(c.r, 2)}</span>
            </p>
            <details className="group mt-3" open={openFirst && idx === 0 ? true : undefined}>
              <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground">
                <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" aria-hidden />
                {t.correlations.showChart}
              </summary>
              <div className="mt-3 rounded-lg bg-card p-3">
                <CorrelationChart c={c} height={180} />
              </div>
            </details>
          </div>
        </div>
      ))}
      {showNone && none.length ? (
        <p className="px-1 text-[13px] text-muted-foreground">{none.map((c) => correlationSentence(c, t)).join(" ")}</p>
      ) : null}
      {!linked.length && !showNone ? <p className="text-sm text-muted-foreground">{t.site.nothingNoticed}</p> : null}
    </div>
  );
}

function kwMeta(o: QueryOpportunity, t: Messages, f: Format) {
  return [o.volume != null ? t.opportunities.volume(f.num(o.volume)) : null, o.difficulty != null ? t.opportunities.difficulty(o.difficulty) : null, o.intent ? ((t.google.intents as Record<string, string>)[o.intent] ?? o.intent) : null]
    .filter(Boolean)
    .join(" · ");
}

/** "Well ranked but few clicks" + "almost on page one", each with the visits to win. */
export async function OpportunitiesCard({ ctrGaps, striking }: { ctrGaps: QueryOpportunity[]; striking: QueryOpportunity[] }) {
  const { t, f } = await getI18n();
  const o = t.opportunities;
  const Group = ({ title, hint, rows, line, gain }: { title: string; hint: string; rows: QueryOpportunity[]; line: (q: QueryOpportunity) => string; gain: (q: QueryOpportunity) => string }) => (
    <div className="min-w-0">
      <p className="font-semibold">{title}</p>
      <p className="mb-2 text-[13px] text-muted-foreground">{hint}</p>
      {rows.length ? (
        <ul className="flex flex-col gap-2">
          {rows.map((q) => (
            <li key={q.query} className="rounded-xl border border-border p-3">
              <p className="flex items-start justify-between gap-3">
                <span className="min-w-0 break-words font-medium">{q.query}</span>
                <Badge tone="good">{gain(q)}</Badge>
              </p>
              <p className="mt-1 text-[13px] text-muted-foreground">{line(q)}</p>
              {kwMeta(q, t, f) ? <p className="text-[13px] text-subtle">{kwMeta(q, t, f)}</p> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{o.nothing}</p>
      )}
    </div>
  );
  return (
    <Card>
      <CardHeader title={o.title} hint={o.hint} icon={<Sparkles className="h-4 w-4 text-gsc" aria-hidden />} />
      <div className="grid grid-cols-1 gap-6 px-5 pb-5 lg:grid-cols-2">
        <Group
          title={o.ctrGaps}
          hint={o.ctrGapsHint}
          rows={ctrGaps}
          line={(q) => o.ctrGapLine(f.dec(q.position, 1), f.pct(q.ctr, 1), f.pct(q.expectedCtr, 0))}
          gain={(q) => o.ctrGapGain(f.num(q.missedClicks))}
        />
        <Group
          title={o.striking}
          hint={o.strikingHint}
          rows={striking}
          line={(q) => o.strikingLine(f.dec(q.position, 1), f.num(q.impressions))}
          gain={(q) => o.strikingGain(f.num(q.missedClicks))}
        />
      </div>
    </Card>
  );
}

const SOURCE_COLOR: Record<Freshness["source"], string> = {
  gsc: "var(--c-gsc)",
  posthog: "var(--c-posthog)",
  sentry: "var(--c-sentry)",
  health: "var(--c-health)",
};

/** When each source was last collected. Sources refresh at different paces, so one shared "updated" stamp would mislead. */
export async function FreshnessLine({ items }: { items: Freshness[] }) {
  const { t, f } = await getI18n();
  if (!items.length) return null;
  return (
    <div className="border-t border-border px-5 py-3">
      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-subtle" title={t.time.collectedHelp}>
        {t.time.collected}
      </p>
      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-muted-foreground">
        {items.map((x) => (
          <li key={x.source} className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: SOURCE_COLOR[x.source] }} aria-hidden />
            <span>{t.sources[x.source]}</span>
            <span className="font-medium text-foreground">{f.ago(x.at)}</span>
            {!x.ok ? (
              <span className="inline-flex items-center gap-1 text-warning">
                <TriangleAlert className="h-3.5 w-3.5" aria-hidden /> {t.time.collectionFailed}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
