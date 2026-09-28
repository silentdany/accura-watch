import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ExternalLink, Settings2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { loadSiteReport } from "@/lib/metrics";
import { loadSiteInsights } from "@/lib/insights";
import { parseRange } from "@/lib/dates";
import { siteVerdict, VERDICT_TONE } from "@/lib/verdict";
import { getI18n } from "@/i18n/server";
import { Badge, Favicon, PageHeader, StatusBadge } from "@/components/ui";
import { RangeTabs } from "@/components/range-tabs";
import { SyncButton } from "@/components/forms";
import { SummaryTab } from "@/components/site/summary-tab";
import { GoogleTab } from "@/components/site/google-tab";
import { VisitorsTab } from "@/components/site/visitors-tab";
import { HealthTab } from "@/components/site/health-tab";
import { SeoTab } from "@/components/site/seo-tab";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const TABS = ["summary", "google", "visitors", "health", "seo"] as const;
type Tab = (typeof TABS)[number];

type Params = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[]>> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const site = await prisma.site.findUnique({ where: { slug: (await params).slug }, select: { name: true } });
  return { title: site?.name ?? "Site" };
}

export default async function SitePage({ params, searchParams }: Params) {
  const { slug } = await params;
  const sp = await searchParams;
  const range = parseRange(sp.range);
  const tabParam = String(Array.isArray(sp.tab) ? sp.tab[0] : (sp.tab ?? "summary"));
  const tab: Tab = (TABS as readonly string[]).includes(tabParam) ? (tabParam as Tab) : "summary";

  const site = await prisma.site.findUnique({ where: { slug } });
  if (!site) notFound();
  const [{ t }, r, i] = await Promise.all([getI18n(), loadSiteReport(site, range), loadSiteInsights(site, range)]);
  const syncErr = (source: string) => r.sync.find((s) => s.source === source && !s.ok)?.error ?? null;
  const verdict = siteVerdict(r, r.alerts);

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <Favicon domain={r.domain} size={36} />
            <span className="min-w-0 truncate">{r.name}</span>
          </span>
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <a href={r.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
              {r.domain} <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
            <StatusBadge status={r.health.status} />
            {verdict !== "down" ? <Badge tone={VERDICT_TONE[verdict]}>{t.verdict[verdict]}</Badge> : null}
            {!r.config.active ? <Badge tone="warning">{t.status.paused}</Badge> : null}
          </span>
        }
        right={
          <>
            <RangeTabs value={range} basePath={`/sites/${slug}`} query={{ tab }} />
            <SyncButton siteId={r.id} />
            <Link href={`/sites#${slug}`} className="btn btn-ghost px-2.5" aria-label={t.site.configure} title={t.site.configure}>
              <Settings2 className="h-4 w-4" />
            </Link>
          </>
        }
      />

      <nav className="no-scrollbar -mx-4 mb-8 overflow-x-auto overflow-y-hidden border-b border-border px-4 sm:mx-0 sm:px-0" aria-label={t.nav.sites}>
        <ul className="flex min-w-max gap-1">
          {TABS.map((k) => (
            <li key={k}>
              <Link
                href={{ pathname: `/sites/${slug}`, query: { tab: k, range } }}
                scroll={false}
                aria-current={k === tab ? "page" : undefined}
                className={`-mb-px inline-flex border-b-2 px-3 py-2.5 text-[15px] font-medium transition-colors ${
                  k === tab ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.site.tabs[k]}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {tab === "summary" ? <SummaryTab r={r} i={i} range={range} /> : null}
      {tab === "google" ? <GoogleTab r={r} i={i} range={range} syncError={syncErr("gsc")} /> : null}
      {tab === "visitors" ? <VisitorsTab r={r} i={i} range={range} syncError={syncErr("posthog")} /> : null}
      {tab === "health" ? <HealthTab r={r} i={i} range={range} syncError={syncErr("sentry")} /> : null}
      {tab === "seo" ? <SeoTab r={r} i={i} /> : null}
    </>
  );
}
