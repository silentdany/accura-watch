import Link from "next/link";
import { ArrowRight, Bug, CheckCircle2, Gauge, OctagonAlert, Search, TrendingDown, TrendingUp, Users } from "lucide-react";
import type { SiteReport } from "@/lib/metrics";
import type { SiteInsights } from "@/lib/insights";
import type { Range } from "@/lib/dates";
import { pctChange } from "@/lib/format";
import { getI18n } from "@/i18n/server";
import { Badge, Card, CardHeader, Delta, Stat } from "../ui";
import { TimeSeriesChart } from "../chart";
import { AlertList } from "../alerts";
import { CorrelationList } from "./common";

export async function SummaryTab({ r, i, range }: { r: SiteReport; i: SiteInsights; range: Range }) {
  const { t, f } = await getI18n();
  const s = t.site.summary;
  const hs = t.home.summary;
  const change = (cur: number, prev: number) => {
    const c = pctChange(cur, prev);
    if (c == null || Math.abs(c) < 0.01) return t.trend.flat.toLowerCase();
    return c > 0 ? hs.up(f.pct(c, 0)) : hs.down(f.pct(-c, 0));
  };
  const vs = t.period.vsPrevious(range);
  const quote = (x: string) => (f.locale === "fr" ? `« ${x} »` : `“${x}”`);

  const lines: { icon: React.ReactNode; text: string }[] = [];
  if (r.health.status === "down") lines.push({ icon: <OctagonAlert className="h-5 w-5 text-destructive" />, text: t.alerts.down.text(r.health.error ?? "") });
  if (r.gsc) {
    const up = r.gsc.clicks >= r.gsc.clicksPrev;
    lines.push({
      icon: up ? <TrendingUp className="h-5 w-5 text-good" /> : <TrendingDown className="h-5 w-5 text-destructive" />,
      text: s.clicks(f.num(r.gsc.clicks), change(r.gsc.clicks, r.gsc.clicksPrev)),
    });
  }
  if (r.posthog) lines.push({ icon: <Users className="h-5 w-5 text-muted-foreground" />, text: s.visitors(f.num(r.posthog.visitors), change(r.posthog.visitors, r.posthog.visitorsPrev)) });
  if (i.searchShare && i.searchShare.value <= 1.2) lines.push({ icon: <Search className="h-5 w-5 text-muted-foreground" />, text: s.share(f.pct(i.searchShare.value, 0)) });
  if (r.health.uptime != null && r.health.status !== "down") lines.push({ icon: <CheckCircle2 className="h-5 w-5 text-good" />, text: s.up(f.pct(r.health.uptime, r.health.uptime === 1 ? 0 : 2)) });
  if (r.health.latencyMs != null) {
    const ms = r.health.latencyMs;
    lines.push({ icon: <Gauge className="h-5 w-5 text-muted-foreground" />, text: s.speed(f.ms(ms), ms < 500 ? s.fast : ms < 1500 ? s.ok : s.slow) });
  }
  if (r.sentry) lines.push({ icon: r.sentry.unresolved ? <Bug className="h-5 w-5 text-warning" /> : <CheckCircle2 className="h-5 w-5 text-good" />, text: r.sentry.unresolved ? s.issues(f.num(r.sentry.unresolved)) : s.noIssues });

  // Top priorities: the biggest wins across both opportunity lists, then the best content gap.
  const actions = [
    ...i.ctrGaps.map((q) => ({ key: `c-${q.query}`, title: q.query, text: t.opportunities.ctrGapsHint, gain: t.opportunities.ctrGapGain(f.num(q.missedClicks)), n: q.missedClicks, tab: "google" })),
    ...i.strikingDistance.map((q) => ({ key: `s-${q.query}`, title: q.query, text: t.opportunities.strikingHint, gain: t.opportunities.strikingGain(f.num(q.missedClicks)), n: q.missedClicks, tab: "google" })),
  ]
    .sort((a, b) => b.n - a.n)
    .slice(0, 3);
  const gap = i.contentGaps[0];

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5 lg:items-start">
        <Card className="lg:col-span-2">
          <CardHeader title={t.site.summaryTitle} hint={t.period.last(range)} />
          <ul className="flex flex-col gap-3.5 px-5 pb-5 pt-1">
            {lines.map((l, k) => (
              <li key={k} className="flex items-start gap-3 text-[15px] leading-snug">
                <span className="mt-px shrink-0" aria-hidden>
                  {l.icon}
                </span>
                {l.text}
              </li>
            ))}
          </ul>
        </Card>
        <div className="lg:col-span-3">
          <AlertList alerts={r.alerts} withSite={false} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          label={t.metrics.clicks.label}
          help={t.metrics.clicks.help}
          color="var(--c-gsc)"
          value={f.num(r.gsc?.clicks)}
          delta={r.gsc ? <Delta cur={r.gsc.clicks} prev={r.gsc.clicksPrev} suffix={vs} /> : null}
        />
        <Stat
          label={t.metrics.visitors.label}
          help={t.metrics.visitors.help}
          color="var(--c-posthog)"
          value={f.num(r.posthog?.visitors)}
          delta={r.posthog ? <Delta cur={r.posthog.visitors} prev={r.posthog.visitorsPrev} suffix={vs} /> : null}
        />
        <Stat
          label={t.metrics.uptime.label}
          help={t.metrics.uptime.help}
          color="var(--c-health)"
          value={r.health.uptime != null ? f.pct(r.health.uptime, r.health.uptime === 1 ? 0 : 2) : "—"}
          footnote={r.health.latencyMs != null ? `${t.metrics.latency.label} · ${f.ms(r.health.latencyMs)}` : null}
        />
        <Stat
          label={t.metrics.issues.label}
          help={t.metrics.issues.help}
          color="var(--c-sentry)"
          value={f.num(r.sentry?.unresolved)}
          footnote={r.sentry ? `${f.num(r.sentry.events)} ${t.metrics.events.label.toLowerCase()}` : null}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title={t.site.noticed} hint={t.site.noticedHint} />
          <CorrelationList items={i.correlations} />
        </Card>
        <Card>
          <CardHeader title={t.site.topActions} hint={t.site.topActionsHint} />
          {actions.length || gap ? (
            <ol className="flex flex-col gap-2 px-5 pb-5">
              {actions.map((a, k) => (
                <li key={a.key}>
                  <Link href={`?tab=${a.tab}&range=${range}`} className="group flex items-start gap-3 rounded-xl border border-border p-3.5 transition-colors hover:bg-muted">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">{k + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center justify-between gap-2">
                        <span className="break-words font-medium">{quote(a.title)}</span>
                        <Badge tone="good">{a.gain}</Badge>
                      </span>
                      <span className="mt-0.5 block text-[13px] text-muted-foreground">{a.text}</span>
                    </span>
                  </Link>
                </li>
              ))}
              {gap ? (
                <li>
                  <Link href={`?tab=seo&range=${range}`} className="group flex items-start gap-3 rounded-xl border border-border p-3.5 transition-colors hover:bg-muted">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                      {actions.length + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center justify-between gap-2">
                        <span className="break-words font-medium">{quote(gap.keyword)}</span>
                        {gap.volume != null ? <Badge tone="info">{t.opportunities.volume(f.num(gap.volume))}</Badge> : null}
                      </span>
                      <span className="mt-0.5 block text-[13px] text-muted-foreground">{t.seo.gapsHint}</span>
                    </span>
                  </Link>
                </li>
              ) : null}
            </ol>
          ) : (
            <p className="px-5 pb-5 text-sm text-muted-foreground">{t.opportunities.nothing}</p>
          )}
          <div className="px-5 pb-5">
            <Link href={`?tab=google&range=${range}`} className="link inline-flex items-center gap-1 text-sm font-medium">
              {t.opportunities.title} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </Card>
      </div>

      {r.gsc ? (
        <Card>
          <CardHeader title={t.metrics.clicks.label} hint={t.time.through(f.dateLong(r.gsc.endDate))} dot="var(--c-gsc)" />
          <div className="px-3 pb-3">
            <TimeSeriesChart dates={r.gsc.clicksSeries.dates} series={[{ name: t.metrics.clicks.label, color: "var(--c-gsc)", values: r.gsc.clicksSeries.values }]} height={220} />
          </div>
        </Card>
      ) : null}
    </div>
  );
}
