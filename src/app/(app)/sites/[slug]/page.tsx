import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ExternalLink, Settings2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { loadSiteReport, type SiteReport, type TopQueryRow } from "@/lib/metrics";
import { ago, parseRange } from "@/lib/dates";
import { fmtMs, fmtNum, fmtPct, fmtPos } from "@/lib/format";
import { Card, CardHeader, Delta, Empty, Favicon, PageHeader, Pill, StatusDot } from "@/components/ui";
import { KpiTile } from "@/components/kpi";
import { RangeTabs } from "@/components/range-tabs";
import { SyncButton } from "@/components/forms";
import { Legend, TimeSeriesChart } from "@/components/chart";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Params = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[]>> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const site = await prisma.site.findUnique({ where: { slug: (await params).slug }, select: { name: true } });
  return { title: site?.name ?? "Site" };
}

const nn = (v: number[]) => v.map((x) => (Number.isFinite(x) ? x : null));

function NotMapped({ what, slug }: { what: string; slug: string }) {
  return (
    <Empty>
      No {what} mapped.{" "}
      <Link href={`/sites#${slug}`} className="text-primary hover:underline">
        Configure
      </Link>
    </Empty>
  );
}

function Waiting({ source }: { source: string }) {
  return <Empty>Waiting for the first {source} sync — hit “Sync now”.</Empty>;
}

function TopTable({ rows, keyLabel, isUrl }: { rows: TopQueryRow[]; keyLabel: string; isUrl?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] text-sm">
        <thead className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          <tr className="border-b border-border">
            <th className="px-4 py-2 text-left font-medium">{keyLabel}</th>
            <th className="px-3 py-2 text-right font-medium">Clicks</th>
            <th className="px-3 py-2 text-right font-medium">Impr.</th>
            <th className="px-3 py-2 text-right font-medium">CTR</th>
            <th className="px-4 py-2 text-right font-medium">Pos.</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 15).map((r) => {
            const label = isUrl ? r.key.replace(/^https?:\/\/[^/]+/, "") || "/" : r.key;
            return (
              <tr key={r.key} className="border-b border-border/60 last:border-0 hover:bg-card-hover">
                <td className="max-w-[280px] truncate px-4 py-2" title={r.key}>
                  {label}
                </td>
                <td className="px-3 py-2 text-right">
                  <span className="tabular font-medium">{fmtNum(r.clicks)}</span>{" "}
                  <Delta cur={r.clicks} prev={r.prevClicks} />
                </td>
                <td className="tabular px-3 py-2 text-right text-muted-foreground">{fmtNum(r.impressions)}</td>
                <td className="tabular px-3 py-2 text-right text-muted-foreground">{fmtPct(r.ctr)}</td>
                <td className="px-4 py-2 text-right">
                  <span className="tabular">{fmtPos(r.position)}</span>{" "}
                  <Delta cur={r.position} prev={r.prevPosition} invert mode="abs" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SimpleTable({ rows, cols }: { rows: Record<string, string | number>[]; cols: { key: string; label: string; num?: boolean }[] }) {
  return (
    <table className="w-full text-sm">
      <thead className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
        <tr className="border-b border-border">
          {cols.map((c, i) => (
            <th key={c.key} className={`py-2 font-medium ${c.num ? "text-right" : "text-left"} ${i === 0 ? "pl-4" : "px-3"} ${i === cols.length - 1 ? "pr-4" : ""}`}>
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, ri) => (
          <tr key={ri} className="border-b border-border/60 last:border-0 hover:bg-card-hover">
            {cols.map((c, i) => (
              <td
                key={c.key}
                className={`py-2 ${c.num ? "tabular text-right" : "max-w-[260px] truncate"} ${i === 0 ? "pl-4" : "px-3"} ${i === cols.length - 1 ? "pr-4" : ""}`}
                title={String(r[c.key])}
              >
                {c.num ? fmtNum(Number(r[c.key])) : String(r[c.key])}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SeoCard({ r }: { r: SiteReport }) {
  const detail = r.seoDetail as {
    organic?: { keywords: number; etv: number; top3: number; top10: number; trafficCost: number } | null;
    backlinks?: { rank: number; backlinks: number; referringDomains: number; referringMainDomains: number; spamScore: number | null; brokenBacklinks: number | null } | null;
    openPageRank?: { score: number; globalRank: number | null } | null;
    errors?: string[];
  } | null;
  const items: { label: string; value: string; delta?: React.ReactNode }[] = [];
  if (detail?.backlinks) {
    items.push(
      { label: "Domain rank", value: String(Math.round(detail.backlinks.rank)), delta: <Delta cur={r.seo?.rank} prev={r.seo?.rankPrev} mode="abs" /> },
      { label: "Referring domains", value: fmtNum(detail.backlinks.referringDomains), delta: <Delta cur={r.seo?.referringDomains} prev={r.seo?.referringDomainsPrev} /> },
      { label: "Backlinks", value: fmtNum(detail.backlinks.backlinks) },
    );
    if (detail.backlinks.spamScore != null) items.push({ label: "Spam score", value: String(detail.backlinks.spamScore) });
  }
  if (detail?.organic) {
    items.push(
      { label: "Organic keywords", value: fmtNum(detail.organic.keywords), delta: <Delta cur={r.seo?.organicKeywords} prev={r.seo?.organicKeywordsPrev} /> },
      { label: "Top 10 keywords", value: fmtNum(detail.organic.top10) },
      { label: "Est. organic traffic", value: fmtNum(detail.organic.etv) },
      { label: "Traffic value", value: `$${fmtNum(detail.organic.trafficCost)}` },
    );
  }
  if (detail?.openPageRank) {
    items.push({ label: "Open PageRank", value: detail.openPageRank.score.toFixed(2) });
    if (detail.openPageRank.globalRank) items.push({ label: "Global rank", value: `#${fmtNum(detail.openPageRank.globalRank)}` });
  }
  return (
    <Card>
      <CardHeader
        title="Domain authority"
        dot="var(--c-seo)"
        hint={r.seo?.collectedAt ? `DataForSEO / Open PageRank · updated ${ago(r.seo.collectedAt)}` : "DataForSEO / Open PageRank"}
      />
      {items.length ? (
        <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
          {[...items, ...Array.from({ length: (4 - (items.length % 4)) % 4 }, () => null)].map((i, idx) =>
            i === null ? (
              <div key={`pad-${idx}`} className="hidden bg-card sm:block" />
            ) : (
            <div key={i.label} className="bg-card px-4 py-3">
              <p className="text-[11px] text-muted-foreground">{i.label}</p>
              <p className="tabular mt-1 flex items-baseline gap-2 text-lg font-semibold">
                {i.value} {i.delta}
              </p>
            </div>
            ),
          )}
        </div>
      ) : (
        <Empty>
          No SEO data yet.{" "}
          <Link href="/settings#dataforseo" className="text-primary hover:underline">
            Connect DataForSEO or Open PageRank
          </Link>
        </Empty>
      )}
      {detail?.errors?.length ? <p className="border-t border-border px-4 py-2 text-xs text-warning">{detail.errors.join(" · ")}</p> : null}
    </Card>
  );
}

export default async function SitePage({ params, searchParams }: Params) {
  const { slug } = await params;
  const range = parseRange((await searchParams).range);
  const site = await prisma.site.findUnique({ where: { slug } });
  if (!site) notFound();
  const r = await loadSiteReport(site, range);

  const syncErr = (source: string) => r.sync.find((s) => s.source === source && !s.ok)?.error;

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <Favicon domain={r.domain} size={26} />
            {r.name}
            <StatusDot status={r.health.status} />
          </span>
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <a href={r.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
              {r.domain} <ExternalLink className="h-3 w-3" />
            </a>
            {r.config.gscProperty ? <Pill>GSC · {r.config.gscProperty}</Pill> : null}
            {r.config.posthogProjectId ? <Pill>PostHog · {r.config.posthogProjectId}</Pill> : null}
            {r.config.sentryProject ? <Pill>Sentry · {r.config.sentryProject}</Pill> : null}
            {!r.config.active ? <Pill tone="warn">paused</Pill> : null}
          </span>
        }
        right={
          <>
            <RangeTabs value={range} basePath={`/sites/${slug}`} />
            <SyncButton siteId={r.id} />
            <Link href={`/sites#${slug}`} className="btn btn-ghost" aria-label="Configure">
              <Settings2 className="h-3.5 w-3.5" />
            </Link>
          </>
        }
      />

      {r.alerts.length ? (
        <div className="mb-6 flex flex-col gap-2">
          {r.alerts.map((a, i) => (
            <div
              key={i}
              className={`rounded-md border px-3 py-2 text-sm ${
                a.severity === "critical"
                  ? "border-destructive/40 bg-destructive/10 text-destructive"
                  : a.severity === "warning"
                    ? "border-warning/30 bg-warning/10 text-warning"
                    : "border-border bg-card text-muted-foreground"
              }`}
            >
              <span className="mr-2 text-[10px] uppercase tracking-wider opacity-80">{a.source}</span>
              {a.message}
            </div>
          ))}
        </div>
      ) : null}

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <KpiTile label="Clicks" color="var(--c-gsc)" value={fmtNum(r.gsc?.clicks)} delta={r.gsc ? <Delta cur={r.gsc.clicks} prev={r.gsc.clicksPrev} /> : undefined} />
        <KpiTile label="Impressions" color="var(--c-gsc-2)" value={fmtNum(r.gsc?.impressions)} delta={r.gsc ? <Delta cur={r.gsc.impressions} prev={r.gsc.impressionsPrev} /> : undefined} />
        <KpiTile label="CTR" color="var(--c-gsc)" value={r.gsc ? fmtPct(r.gsc.ctr, 2) : "—"} delta={r.gsc ? <Delta cur={r.gsc.ctr} prev={r.gsc.ctrPrev} /> : undefined} />
        <KpiTile label="Position" color="var(--c-gsc)" value={fmtPos(r.gsc?.position)} delta={r.gsc ? <Delta cur={r.gsc.position} prev={r.gsc.positionPrev} invert mode="abs" /> : undefined} />
        <KpiTile label="Visitors" color="var(--c-posthog)" value={fmtNum(r.posthog?.visitors)} delta={r.posthog ? <Delta cur={r.posthog.visitors} prev={r.posthog.visitorsPrev} /> : undefined} />
        <KpiTile label="Pageviews" color="var(--c-posthog)" value={fmtNum(r.posthog?.pageviews)} delta={r.posthog ? <Delta cur={r.posthog.pageviews} prev={r.posthog.pageviewsPrev} /> : undefined} />
        <KpiTile
          label="Uptime"
          color="var(--c-health)"
          value={r.health.uptime != null ? fmtPct(r.health.uptime, 2) : "—"}
          hint={`${fmtMs(r.health.latencyMs)}${r.health.sslDaysLeft != null ? ` · TLS ${r.health.sslDaysLeft}d` : ""}`}
        />
        <KpiTile
          label="Open issues"
          color="var(--c-sentry)"
          value={fmtNum(r.sentry?.unresolved)}
          hint={r.sentry ? `${fmtNum(r.sentry.events)} events` : undefined}
          delta={r.sentry ? <Delta cur={r.sentry.events} prev={r.sentry.eventsPrev} invert /> : undefined}
        />
      </div>

      {/* Search Console */}
      <h2 className="eyebrow mb-3 mt-8">Search Console</h2>
      {!r.config.gscProperty ? (
        <Card className="mb-6">
          <NotMapped what="Search Console property" slug={slug} />
        </Card>
      ) : !r.gsc ? (
        <Card className="mb-6">{syncErr("gsc") ? <Empty>Sync error: {syncErr("gsc")}</Empty> : <Waiting source="Search Console" />}</Card>
      ) : (
        <>
          <div className="mb-3 grid gap-3 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader title="Clicks" dot="var(--c-gsc)" hint={`Daily · through ${r.gsc.endDate}`} />
              <div className="p-3">
                <TimeSeriesChart dates={r.gsc.clicksSeries.dates} series={[{ name: "Clicks", color: "var(--c-gsc)", values: r.gsc.clicksSeries.values }]} height={220} />
              </div>
            </Card>
            <div className="flex flex-col gap-3">
              <Card>
                <CardHeader title="Impressions" dot="var(--c-gsc-2)" />
                <div className="p-3">
                  <TimeSeriesChart
                    dates={r.gsc.impressionsSeries.dates}
                    series={[{ name: "Impressions", color: "var(--c-gsc-2)", values: r.gsc.impressionsSeries.values }]}
                    height={82}
                    kind="line"
                  />
                </div>
              </Card>
              <Card>
                <CardHeader title="Average position" dot="var(--c-gsc)" hint="Lower is better" />
                <div className="p-3">
                  <TimeSeriesChart
                    dates={r.gsc.positionSeries.dates}
                    series={[{ name: "Position", color: "var(--c-gsc)", values: nn(r.gsc.positionSeries.values) }]}
                    height={82}
                    kind="line"
                    invertY
                    format="position"
                  />
                </div>
              </Card>
            </div>
          </div>
          <div className="mb-6 grid gap-3 xl:grid-cols-2">
            <Card>
              <CardHeader title="Top queries" hint={r.gscTopQueries ? `${r.gscTopQueries.startDate} → ${r.gscTopQueries.endDate} · vs previous 28 days` : undefined} />
              {r.gscTopQueries?.rows.length ? <TopTable rows={r.gscTopQueries.rows} keyLabel="Query" /> : <Empty>No queries yet.</Empty>}
            </Card>
            <Card>
              <CardHeader title="Top pages" hint={r.gscTopPages ? `${r.gscTopPages.startDate} → ${r.gscTopPages.endDate}` : undefined} />
              {r.gscTopPages?.rows.length ? <TopTable rows={r.gscTopPages.rows} keyLabel="Page" isUrl /> : <Empty>No pages yet.</Empty>}
            </Card>
          </div>
        </>
      )}

      {/* Analytics */}
      <h2 className="eyebrow mb-3 mt-8">Analytics</h2>
      {!r.config.posthogProjectId ? (
        <Card className="mb-6">
          <NotMapped what="PostHog project" slug={slug} />
        </Card>
      ) : !r.posthog ? (
        <Card className="mb-6">{syncErr("posthog") ? <Empty>Sync error: {syncErr("posthog")}</Empty> : <Waiting source="PostHog" />}</Card>
      ) : (
        <div className="mb-6 grid gap-3 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader
              title="Traffic"
              hint="Daily unique visitors and pageviews"
              right={
                <Legend
                  items={[
                    { name: "Pageviews", color: "var(--c-posthog)" },
                    { name: "Visitors", color: "var(--c-gsc-2)" },
                  ]}
                />
              }
            />
            <div className="p-3">
              <TimeSeriesChart
                dates={r.posthog.visitorsSeries.dates}
                series={[
                  { name: "Pageviews", color: "var(--c-posthog)", values: r.posthog.pageviewsSeries.values },
                  { name: "Visitors", color: "var(--c-gsc-2)", values: r.posthog.visitorsSeries.values },
                ]}
                height={220}
              />
            </div>
          </Card>
          <div className="flex flex-col gap-3">
            <Card>
              <CardHeader title="Top pages" hint="Last 28 days" />
              {r.posthogTopPages?.length ? (
                <SimpleTable
                  rows={r.posthogTopPages.slice(0, 6)}
                  cols={[
                    { key: "key", label: "Path" },
                    { key: "visitors", label: "Visitors", num: true },
                  ]}
                />
              ) : (
                <Empty>No data</Empty>
              )}
            </Card>
            <Card>
              <CardHeader title="Referrers" hint="Last 28 days" />
              {r.posthogReferrers?.length ? (
                <SimpleTable
                  rows={r.posthogReferrers.slice(0, 6)}
                  cols={[
                    { key: "key", label: "Source" },
                    { key: "visitors", label: "Visitors", num: true },
                  ]}
                />
              ) : (
                <Empty>No data</Empty>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* Reliability */}
      <h2 className="eyebrow mb-3 mt-8">Reliability</h2>
      <div className="mb-6 grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Response time"
            dot="var(--c-health)"
            hint={`${r.health.lastCheckedAt ? `Checked ${ago(r.health.lastCheckedAt)}` : "Not checked yet"}${r.health.statusCode ? ` · HTTP ${r.health.statusCode}` : ""}${r.health.error ? ` · ${r.health.error}` : ""}`}
          />
          <div className="p-3">
            <TimeSeriesChart
              dates={r.latency.dates}
              series={[{ name: "Latency", color: "var(--c-health)", values: nn(r.latency.values) }]}
              height={180}
              kind="line"
              format="ms"
              dateFormat="datetime"
              emptyLabel="Uptime checks run with each sync"
            />
          </div>
        </Card>
        <Card>
          <CardHeader title="Errors" dot="var(--c-sentry)" hint={r.config.sentryProject ? `Sentry · ${r.config.sentryProject}` : undefined} />
          {!r.config.sentryProject ? (
            <NotMapped what="Sentry project" slug={slug} />
          ) : !r.sentry ? (
            syncErr("sentry") ? <Empty>Sync error: {syncErr("sentry")}</Empty> : <Waiting source="Sentry" />
          ) : (
            <>
              <div className="p-3">
                <TimeSeriesChart
                  dates={r.sentry.eventsSeries.dates}
                  series={[{ name: "Error events", color: "var(--c-sentry)", values: r.sentry.eventsSeries.values }]}
                  height={100}
                  kind="bar"
                  emptyLabel="No error events 🎉"
                />
              </div>
              {r.sentryIssues?.length ? (
                <ul className="divide-y divide-border/60 border-t border-border">
                  {r.sentryIssues.slice(0, 6).map((i) => (
                    <li key={i.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${i.level === "error" || i.level === "fatal" ? "bg-destructive" : "bg-warning"}`} aria-label={i.level} />
                      <a href={i.permalink} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate hover:text-primary" title={i.title}>
                        {i.title}
                      </a>
                      <span className="tabular shrink-0 text-xs text-muted-foreground">
                        {fmtNum(i.count)} ev · {fmtNum(i.userCount)} users · {ago(i.lastSeen)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty>No unresolved issues.</Empty>
              )}
            </>
          )}
        </Card>
      </div>

      {/* SEO */}
      <h2 className="eyebrow mb-3 mt-8">Domain SEO</h2>
      <SeoCard r={r} />
    </>
  );
}
