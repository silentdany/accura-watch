import Link from "next/link";
import { ArrowRight, Bot, Bug, CheckCircle2, Link2, OctagonAlert, ShieldAlert, TrendingDown, TrendingUp, Users } from "lucide-react";
import { loadOverview } from "@/lib/metrics";
import { countsDiverge } from "@/lib/origins";
import { integrationStatuses } from "@/lib/integrations";
import { parseRange } from "@/lib/dates";
import { pctChange } from "@/lib/format";
import { getI18n } from "@/i18n/server";
import { Card, CardHeader, Delta, PageHeader, Section, Stat } from "@/components/ui";
import { RangeTabs } from "@/components/range-tabs";
import { SyncButton } from "@/components/forms";
import { Legend, TimeSeriesChart } from "@/components/chart";
import { Sparkline } from "@/components/sparkline";
import type { Series } from "@/lib/metrics";
import { AlertList } from "@/components/alerts";
import { SiteCard } from "@/components/site-card";
import { FreshnessLine } from "@/components/site/common";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function onDates(series: Series | undefined, dates: string[]): (number | null)[] {
  const map = new Map(series?.dates.map((d, i) => [d, series.values[i]]) ?? []);
  return dates.map((d) => (map.has(d) && Number.isFinite(map.get(d)!) ? map.get(d)! : null));
}

function asPoints(values: number[]): (number | null)[] {
  return values.map((v) => (Number.isFinite(v) ? v : null));
}

function varies(values: (number | null)[]): boolean {
  return new Set(values.filter((v): v is number => v != null)).size >= 2;
}

async function Onboarding() {
  const { t } = await getI18n();
  const integrations = await integrationStatuses();
  const google = integrations.find((i) => i.id === "google")!;
  const o = t.home.onboarding;
  const steps = [
    { done: google.connected, ...o.google, href: "/settings#google" },
    { done: false, ...o.sites, href: "/sites" },
    { done: integrations.some((i) => i.connected && i.id !== "google"), ...o.more, href: "/settings" },
    { done: false, ...o.agent, href: "/settings#agent" },
  ];
  return (
    <>
      <PageHeader title={o.title} subtitle={o.subtitle} />
      <ol className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {steps.map((s, i) => (
          <li key={s.title} className="card flex flex-col gap-2 p-6">
            <span className={`text-sm font-medium ${s.done ? "text-good" : "text-subtle"}`}>{s.done ? `✓ ${o.done}` : o.step(i + 1)}</span>
            <p className="text-lg font-semibold">{s.title}</p>
            <p className="flex-1 text-[15px] text-muted-foreground">{s.body}</p>
            <Link href={s.href} className="btn btn-primary mt-2 self-start">
              {s.cta} <ArrowRight className="h-4 w-4" />
            </Link>
          </li>
        ))}
      </ol>
    </>
  );
}

export default async function HomePage({ searchParams }: { searchParams: Promise<Record<string, string | string[]>> }) {
  const range = parseRange((await searchParams).range);
  const [{ t, f }, o] = await Promise.all([getI18n(), loadOverview(range)]);
  const tot = o.totals;
  if (o.sites.length === 0) return <Onboarding />;

  const s = t.home.summary;
  const changeText = (cur: number, prev: number) => {
    const c = pctChange(cur, prev);
    if (c == null || Math.abs(c) < 0.01) return null;
    return c > 0 ? s.up(f.pct(c, 0)) : s.down(f.pct(-c, 0));
  };
  const gscSites = o.sites.filter((x) => x.gsc);
  const phSites = o.sites.filter((x) => x.posthog);
  const sentrySites = o.sites.filter((x) => x.sentry);

  // The "In short" story, most important first.
  const lines: { icon: React.ReactNode; text: string }[] = [];
  if (tot.down) lines.push({ icon: <OctagonAlert className="h-5 w-5 text-destructive" />, text: s.someDown(tot.down) });
  if (gscSites.length) {
    const c = changeText(tot.clicks, tot.clicksPrev);
    const up = tot.clicks >= tot.clicksPrev;
    lines.push({
      icon: up ? <TrendingUp className="h-5 w-5 text-good" /> : <TrendingDown className="h-5 w-5 text-destructive" />,
      text: c ? s.clicks(f.num(tot.clicks), c) : s.clicksFlat(f.num(tot.clicks)),
    });
  }
  if (phSites.length) {
    const c = changeText(tot.visitors, tot.visitorsPrev);
    lines.push({ icon: <Users className="h-5 w-5 text-muted-foreground" />, text: s.visitors(f.num(tot.visitors), c ?? t.trend.flat.toLowerCase()) });
  }
  const expiring = o.sites
    .filter((site) => site.health.sslDaysLeft != null && site.health.sslDaysLeft < 14)
    .sort((a, b) => a.health.sslDaysLeft! - b.health.sslDaysLeft!);
  for (const site of expiring) {
    const days = site.health.sslDaysLeft!;
    lines.push({
      icon: <ShieldAlert className={`h-5 w-5 ${days < 3 ? "text-destructive" : "text-warning"}`} />,
      text: s.tls(site.name, days),
    });
  }
  const best = gscSites
    .map((x) => ({ x, c: pctChange(x.gsc!.clicks, x.gsc!.clicksPrev) }))
    .filter((b) => b.c != null && b.c >= 0.1 && b.x.gsc!.clicks >= 20)
    .sort((a, b) => b.c! - a.c!)[0];
  if (best && gscSites.length > 1) lines.push({ icon: <TrendingUp className="h-5 w-5 text-good" />, text: s.best(best.x.name, `+${f.pct(best.c!, 0)}`) });
  if (o.linkYield) {
    const y = o.linkYield;
    const ratio = (n: number) => f.dec(n, n >= 10 ? 0 : 1);
    const text = y.worst
      ? s.linkYieldBoth(y.best.name, ratio(y.best.clicksPerDomain), y.worst.name, ratio(y.worst.clicksPerDomain))
      : y.sites >= 2
        ? s.linkYieldTied
        : s.linkYield(y.best.name, ratio(y.best.clicksPerDomain));
    lines.push({ icon: <Link2 className="h-5 w-5 text-muted-foreground" />, text });
  }
  if (!tot.down) lines.push({ icon: <CheckCircle2 className="h-5 w-5 text-good" />, text: s.allUp });
  if (sentrySites.length) {
    lines.push({
      icon: tot.unresolved ? <Bug className="h-5 w-5 text-warning" /> : <CheckCircle2 className="h-5 w-5 text-good" />,
      text: tot.unresolved ? s.issues(f.num(tot.unresolved)) : s.noIssues,
    });
  }

  const sites = [...o.sites].sort((a, b) => Number(b.pinned) - Number(a.pinned) || (b.gsc?.clicks ?? -1) - (a.gsc?.clicks ?? -1));
  const vs = t.period.vsPrevious(range);
  const bothTrends = gscSites.length > 0 && phSites.length > 0;
  const chartDates = phSites.length ? tot.visitorsSeries.dates : tot.clicksSeries.dates;
  const noteDates = bothTrends || !gscSites.length ? chartDates : tot.clicksSeries.dates;
  const mixByDate = new Map(o.dayMix.map((day) => [day.date, day]));
  const dayNotes = phSites.length
    ? noteDates.map((date) => {
        const day = mixByDate.get(date);
        if (!day?.site) return null;
        const parts: string[] = [];
        if (day.measured && day.google + day.direct + day.other > 0) {
          parts.push(s.dayLead(day.site, f.num(day.google), f.num(day.direct), f.num(day.other)));
          parts.push(s.dayOrigins);
        } else {
          parts.push(s.daySite(day.site));
        }
        if (day.measured && day.clicks != null && countsDiverge(day.clicks, day.google)) {
          parts.push(s.dayGap(f.num(day.clicks), f.num(day.google)));
        }
        return parts.join(" ");
      })
    : undefined;
  const keywords = asPoints(tot.keywordsSeries.values);
  const referring = asPoints(tot.referringSeries.values);
  const hasSeo = tot.keywords != null || tot.referringDomains != null || tot.estimated != null;
  const seoBoth = keywords.some((v) => v != null) && referring.some((v) => v != null);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        flush
        title={t.home.hello}
        subtitle={
          <>
            {t.home.intro(o.sites.length)}
          </>
        }
        right={
          <>
            <RangeTabs value={range} basePath="/" />
            <SyncButton />
          </>
        }
      />

      <Card>
        <CardHeader title={t.home.summaryTitle} hint={t.period.last(range)} />
        <ul className="grid grid-cols-1 gap-x-8 gap-y-3.5 px-5 pb-5 pt-1 md:grid-cols-2">
          {lines.map((l, i) => (
            <li key={i} className="flex items-start gap-3 text-[15px] leading-snug">
              <span className="mt-px shrink-0" aria-hidden>
                {l.icon}
              </span>
              {l.text}
            </li>
          ))}
        </ul>
        <FreshnessLine items={o.freshness} />
      </Card>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          label={t.metrics.clicks.label}
          help={t.metrics.clicks.help}
          color="var(--c-gsc)"
          value={gscSites.length ? f.num(tot.clicks) : "—"}
          delta={gscSites.length ? <Delta cur={tot.clicks} prev={tot.clicksPrev} suffix={vs} /> : null}
        />
        <Stat
          label={t.metrics.visitors.label}
          help={t.metrics.visitors.help}
          color="var(--c-posthog)"
          value={phSites.length ? f.num(tot.visitors) : "—"}
          delta={phSites.length ? <Delta cur={tot.visitors} prev={tot.visitorsPrev} suffix={vs} /> : null}
          footnote={phSites.length ? null : t.siteCard.notConnected}
        />
        <Stat
          label={t.metrics.sitesOnline.label}
          help={t.metrics.sitesOnline.help}
          color="var(--c-health)"
          value={
            <span className={tot.down ? "text-destructive" : ""}>
              {tot.up}
              <span className="text-lg font-medium text-subtle"> / {tot.sites}</span>
            </span>
          }
          footnote={tot.down ? s.someDown(tot.down) : s.allUp}
        />
        <Stat
          label={t.metrics.issues.label}
          help={t.metrics.issues.help}
          color="var(--c-sentry)"
          value={sentrySites.length ? f.num(tot.unresolved) : "—"}
          footnote={sentrySites.length ? `${f.num(tot.events)} ${t.metrics.events.label.toLowerCase()}` : t.siteCard.notConnected}
        />
      </div>

      <Section
        title={t.home.sitesTitle}
        right={
          <Link href="/sites" className="btn btn-quiet btn-sm">
            {t.home.manage} <ArrowRight className="h-4 w-4" />
          </Link>
        }
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sites.map((row) => (
            <SiteCard key={row.id} row={row} alerts={o.alerts} />
          ))}
        </div>
      </Section>

      {gscSites.length || phSites.length ? (
        <Card>
          <CardHeader
            title={bothTrends ? t.home.chartTitle : gscSites.length ? t.home.chartClicksTitle : t.home.chartVisitorsTitle}
            hint={bothTrends ? t.home.chartHint : phSites.length ? t.home.chartVisitorsHint : t.home.chartHintSingle}
            dot={gscSites.length ? "var(--c-gsc)" : "var(--c-posthog)"}
            right={
              bothTrends ? (
                <Legend
                  items={[
                    { name: t.metrics.clicks.label, color: "var(--c-gsc)" },
                    { name: t.metrics.visitors.label, color: "var(--c-companion)", dashed: true },
                  ]}
                />
              ) : null
            }
          />
          <div className="px-3 pb-3">
            <TimeSeriesChart
              dates={bothTrends || !gscSites.length ? chartDates : tot.clicksSeries.dates}
              indexed={bothTrends}
              height={240}
              series={
                bothTrends
                  ? [
                      { name: t.metrics.clicks.label, color: "var(--c-gsc)", values: onDates(tot.clicksSeries, chartDates) },
                      { name: t.metrics.visitors.label, color: "var(--c-companion)", values: onDates(tot.visitorsSeries, chartDates), dashed: true },
                    ]
                  : gscSites.length
                    ? [{ name: t.metrics.clicks.label, color: "var(--c-gsc)", values: tot.clicksSeries.values }]
                    : [{ name: t.metrics.visitors.label, color: "var(--c-posthog)", values: tot.visitorsSeries.values }]
              }
              notes={dayNotes}
            />
          </div>
        </Card>
      ) : null}

      {hasSeo ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {tot.keywords != null ? (
            <Stat
              label={t.metrics.keywords.label}
              help={t.metrics.keywords.help}
              color="var(--c-seo)"
              value={f.num(tot.keywords)}
              delta={<Delta cur={tot.keywords} prev={tot.keywordsPrev} />}
              chart={<Sparkline values={tot.keywordsSeries.values} color="var(--c-seo)" width={96} height={36} />}
            />
          ) : null}
          {tot.referringDomains != null ? (
            <Stat
              label={t.metrics.referringDomains.label}
              help={t.metrics.referringDomains.help}
              color="var(--c-seo)"
              value={f.num(tot.referringDomains)}
              delta={<Delta cur={tot.referringDomains} prev={tot.referringDomainsPrev} />}
              chart={<Sparkline values={tot.referringSeries.values} color="var(--c-seo)" width={96} height={36} />}
            />
          ) : null}
          {tot.estimated != null ? (
            <Stat
              label={t.metrics.estimated.label}
              help={t.metrics.estimated.help}
              color="var(--c-seo)"
              value={
                <>
                  {f.num(tot.estimated)}
                  <span className="text-lg font-medium text-subtle">{t.common.perMonth}</span>
                </>
              }
              delta={<Delta cur={tot.estimated} prev={tot.estimatedPrev} />}
              chart={<Sparkline values={tot.etvSeries.values} color="var(--c-seo)" width={96} height={36} />}
            />
          ) : null}
        </div>
      ) : null}

      {varies(keywords) || varies(referring) ? (
        <Card>
          <CardHeader
            title={t.home.seoTitle}
            hint={seoBoth ? t.home.seoHint : t.home.seoHintSingle}
            dot="var(--c-seo)"
            right={
              seoBoth ? (
                <Legend
                  items={[
                    { name: t.metrics.keywords.label, color: "var(--c-seo)" },
                    { name: t.metrics.referringDomains.label, color: "var(--c-companion)", dashed: true },
                  ]}
                />
              ) : null
            }
          />
          <div className="px-3 pb-3">
            <TimeSeriesChart
              dates={tot.keywordsSeries.dates}
              indexed={seoBoth}
              height={220}
              series={
                seoBoth
                  ? [
                      { name: t.metrics.keywords.label, color: "var(--c-seo)", values: keywords },
                      { name: t.metrics.referringDomains.label, color: "var(--c-companion)", values: referring, dashed: true },
                    ]
                  : keywords.some((v) => v != null)
                    ? [{ name: t.metrics.keywords.label, color: "var(--c-seo)", values: keywords }]
                    : [{ name: t.metrics.referringDomains.label, color: "var(--c-seo)", values: referring }]
              }
            />
          </div>
        </Card>
      ) : null}

      <AlertList alerts={o.alerts} max={6} />

      <Link href="/settings#agent" className="card group flex items-center gap-4 border-dashed p-5 transition-colors hover:bg-card-hover">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
          <Bot className="h-5 w-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{t.home.askAgent}</span>
          <span className="block text-[15px] text-muted-foreground">{t.home.askAgentExample}</span>
        </span>
        <ArrowRight className="h-5 w-5 shrink-0 text-subtle group-hover:text-foreground" aria-hidden />
      </Link>
    </div>
  );
}
