import Link from "next/link";
import { ArrowRight, Bot, Bug, CheckCircle2, OctagonAlert, TrendingDown, TrendingUp, Users } from "lucide-react";
import { loadOverview } from "@/lib/metrics";
import { integrationStatuses } from "@/lib/integrations";
import { parseRange } from "@/lib/dates";
import { pctChange } from "@/lib/format";
import { getI18n } from "@/i18n/server";
import { Card, CardHeader, Delta, PageHeader, Section, Stat } from "@/components/ui";
import { RangeTabs } from "@/components/range-tabs";
import { SyncButton } from "@/components/forms";
import { TimeSeriesChart } from "@/components/chart";
import { AlertList } from "@/components/alerts";
import { SiteCard } from "@/components/site-card";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

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
  const best = gscSites
    .map((x) => ({ x, c: pctChange(x.gsc!.clicks, x.gsc!.clicksPrev) }))
    .filter((b) => b.c != null && b.c >= 0.1 && b.x.gsc!.clicks >= 20)
    .sort((a, b) => b.c! - a.c!)[0];
  if (best && gscSites.length > 1) lines.push({ icon: <TrendingUp className="h-5 w-5 text-good" />, text: s.best(best.x.name, `+${f.pct(best.c!, 0)}`) });
  if (!tot.down) lines.push({ icon: <CheckCircle2 className="h-5 w-5 text-good" />, text: s.allUp });
  if (sentrySites.length) {
    lines.push({
      icon: tot.unresolved ? <Bug className="h-5 w-5 text-warning" /> : <CheckCircle2 className="h-5 w-5 text-good" />,
      text: tot.unresolved ? s.issues(f.num(tot.unresolved)) : s.noIssues,
    });
  }

  const sites = [...o.sites].sort((a, b) => Number(b.pinned) - Number(a.pinned) || (b.gsc?.clicks ?? -1) - (a.gsc?.clicks ?? -1));
  const vs = t.period.vsPrevious(range);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        flush
        title={t.home.hello}
        subtitle={
          <>
            {t.home.intro(o.sites.length)} <span className="text-subtle">· {t.time.updated(f.ago(o.lastSync))}</span>
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

      {gscSites.length ? (
        <Card>
          <CardHeader title={t.home.chartTitle} hint={t.home.chartHint} dot="var(--c-gsc)" />
          <div className="px-3 pb-3">
            <TimeSeriesChart dates={tot.clicksSeries.dates} series={[{ name: t.metrics.clicks.label, color: "var(--c-gsc)", values: tot.clicksSeries.values }]} height={240} />
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
