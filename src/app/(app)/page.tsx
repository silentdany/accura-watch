import Link from "next/link";
import { AlertTriangle, ArrowRight, Bot, CircleAlert, Info, Search } from "lucide-react";
import { loadOverview, type Alert } from "@/lib/metrics";
import { integrationStatuses } from "@/lib/integrations";
import { ago, parseRange } from "@/lib/dates";
import { fmtNum, fmtPct, fmtPos } from "@/lib/format";
import { Card, CardHeader, Delta, PageHeader } from "@/components/ui";
import { KpiTile } from "@/components/kpi";
import { RangeTabs } from "@/components/range-tabs";
import { SyncButton } from "@/components/forms";
import { SitesTable } from "@/components/sites-table";
import { TimeSeriesChart } from "@/components/chart";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const severityIcon = { critical: CircleAlert, warning: AlertTriangle, info: Info };
const severityColor = { critical: "text-destructive", warning: "text-warning", info: "text-muted-foreground" };

function Alerts({ alerts }: { alerts: Alert[] }) {
  if (!alerts.length) return null;
  return (
    <Card className="mb-6">
      <CardHeader title={`Needs attention · ${alerts.length}`} />
      <ul className="divide-y divide-border/70">
        {alerts.slice(0, 8).map((a, i) => {
          const Icon = severityIcon[a.severity];
          return (
            <li key={i} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <Icon className={`h-4 w-4 shrink-0 ${severityColor[a.severity]}`} aria-label={a.severity} />
              <Link href={`/sites/${a.site}`} className="shrink-0 font-medium hover:text-primary">
                {a.siteName}
              </Link>
              <span className="min-w-0 truncate text-muted-foreground" title={a.message}>
                {a.message}
              </span>
              <span className="ml-auto shrink-0 text-[11px] uppercase tracking-wider text-subtle">{a.source}</span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

async function Onboarding() {
  const integrations = await integrationStatuses();
  const google = integrations.find((i) => i.id === "google")!;
  const steps = [
    {
      done: google.connected,
      title: "Connect Google Search Console",
      body: "OAuth or a service account — Search Console is the priority data source.",
      href: "/settings#google",
      cta: "Connect",
    },
    {
      done: false,
      title: "Import your sites",
      body: "Pick properties from Search Console, or add any domain by hand.",
      href: "/sites",
      cta: "Add sites",
    },
    {
      done: integrations.filter((i) => i.connected && i.id !== "google").length > 0,
      title: "Plug PostHog, Sentry & SEO data",
      body: "Projects are auto-matched to sites by name. DataForSEO is pay-as-you-go; Open PageRank is free.",
      href: "/settings",
      cta: "Integrations",
    },
    {
      done: false,
      title: "Connect your AI agent",
      body: "Every metric and action is exposed over MCP — ask Claude for your weekly review.",
      href: "/settings#mcp",
      cta: "MCP setup",
    },
  ];
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border bg-[radial-gradient(600px_200px_at_0%_0%,hsl(158_70%_55%/0.08),transparent)] px-6 py-8">
        <p className="eyebrow">Welcome</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">All your sites, one glance.</h2>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Search Console first, then analytics, errors, uptime and domain authority — collected on a schedule and queryable by your AI agents.
        </p>
      </div>
      <ol className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s, i) => (
          <li key={s.title} className="flex flex-col gap-2 bg-card p-5">
            <span className={`tabular text-xs font-semibold ${s.done ? "text-primary" : "text-subtle"}`}>{s.done ? "✓ Done" : `Step ${i + 1}`}</span>
            <p className="font-medium">{s.title}</p>
            <p className="flex-1 text-sm text-muted-foreground">{s.body}</p>
            <Link href={s.href} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
              {s.cta} <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </li>
        ))}
      </ol>
    </Card>
  );
}

export default async function OverviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[]>> }) {
  const range = parseRange((await searchParams).range);
  const o = await loadOverview(range);
  const t = o.totals;

  if (o.sites.length === 0) {
    return (
      <>
        <PageHeader title="Portfolio" subtitle="No sites yet" />
        <Onboarding />
      </>
    );
  }

  const withSeo = o.sites.filter((s) => s.seo?.rank != null);
  const avgRank = withSeo.length ? withSeo.reduce((a, s) => a + (s.seo!.rank ?? 0), 0) / withSeo.length : null;
  const withOpr = o.sites.filter((s) => s.seo?.opr != null);
  const avgOpr = withOpr.length ? withOpr.reduce((a, s) => a + (s.seo!.opr ?? 0), 0) / withOpr.length : null;
  const gscCount = o.sites.filter((s) => s.gsc).length;
  const phCount = o.sites.filter((s) => s.posthog).length;
  const sentryCount = o.sites.filter((s) => s.sentry).length;

  return (
    <>
      <PageHeader
        title="Portfolio"
        subtitle={`${t.sites} sites · last ${range} days vs previous · synced ${ago(o.lastSync)}`}
        right={
          <>
            <RangeTabs value={range} basePath="/" />
            <SyncButton />
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-6">
        {/* Hero: Search Console clicks */}
        <div className="col-span-2 row-span-2 flex flex-col rounded-[var(--radius-md)] border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="eyebrow flex items-center gap-1.5">
                <Search className="h-3 w-3" /> Search clicks
              </p>
              <p className="tabular mt-2 text-4xl font-semibold tracking-tight">{fmtNum(t.clicks)}</p>
              <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <Delta cur={t.clicks} prev={t.clicksPrev} /> vs {fmtNum(t.clicksPrev)} · {gscCount} site{gscCount === 1 ? "" : "s"}
              </p>
            </div>
          </div>
          <div className="mt-3 flex-1">
            <TimeSeriesChart
              dates={t.clicksSeries.dates}
              series={[{ name: "Clicks", color: "var(--c-gsc)", values: t.clicksSeries.values }]}
              height={150}
              emptyLabel="Connect Search Console to see clicks"
            />
          </div>
        </div>

        <KpiTile label="Impressions" color="var(--c-gsc-2)" value={fmtNum(t.impressions)} delta={<Delta cur={t.impressions} prev={t.impressionsPrev} />} />
        <KpiTile label="CTR" color="var(--c-gsc)" value={fmtPct(t.ctr, 2)} delta={<Delta cur={t.ctr} prev={t.ctrPrev} />} />
        <KpiTile label="Avg position" color="var(--c-gsc)" value={fmtPos(t.position)} delta={<Delta cur={t.position} prev={t.positionPrev} invert mode="abs" />} />
        <KpiTile
          label="Visitors"
          color="var(--c-posthog)"
          value={phCount ? fmtNum(t.visitors) : "—"}
          delta={phCount ? <Delta cur={t.visitors} prev={t.visitorsPrev} /> : undefined}
          hint={phCount ? undefined : "PostHog not mapped"}
        />
        <KpiTile
          label="Uptime"
          color="var(--c-health)"
          value={
            <span className={t.down ? "text-destructive" : ""}>
              {t.up}/{t.sites}
            </span>
          }
          hint={t.down ? `${t.down} down` : "all up"}
        />
        <KpiTile
          label="Open issues"
          color="var(--c-sentry)"
          value={sentryCount ? fmtNum(t.unresolved) : "—"}
          hint={sentryCount ? `${fmtNum(t.events)} events` : "Sentry not mapped"}
          delta={sentryCount ? <Delta cur={t.events} prev={t.eventsPrev} invert /> : undefined}
        />
        <KpiTile
          label="Avg authority"
          color="var(--c-seo)"
          value={avgRank != null ? Math.round(avgRank) : avgOpr != null ? avgOpr.toFixed(1) : "—"}
          hint={avgRank != null ? "DataForSEO rank /100" : avgOpr != null ? "Open PageRank /10" : "No SEO provider"}
        />
        <Link
          href="/settings#mcp"
          className="group flex flex-col justify-between gap-2 rounded-[var(--radius-md)] border border-dashed border-border-strong p-4 transition-colors hover:border-primary/50"
        >
          <p className="eyebrow flex items-center gap-1.5">
            <Bot className="h-3 w-3" /> Ask your agent
          </p>
          <p className="text-sm text-muted-foreground group-hover:text-foreground">“Which pages lost clicks this month and why?”</p>
        </Link>
      </div>

      <Alerts alerts={o.alerts} />

      <Card>
        <CardHeader
          title="Sites"
          hint="Click a column to sort · pinned sites stay on top"
          right={
            <Link href="/sites" className="text-xs text-muted-foreground hover:text-foreground">
              Manage →
            </Link>
          }
        />
        <SitesTable rows={o.sites} range={range} />
      </Card>
    </>
  );
}
