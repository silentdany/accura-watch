import Link from "next/link";
import { ArrowUpRight, Pin } from "lucide-react";
import type { Alert, SiteRow } from "@/lib/metrics";
import { siteVerdict, VERDICT_TONE } from "@/lib/verdict";
import { getI18n } from "@/i18n/server";
import { Badge, Delta, Favicon, StatusBadge } from "./ui";
import { Sparkline } from "./sparkline";

function Metric({ label, value, delta, muted }: { label: string; value: React.ReactNode; delta?: React.ReactNode; muted?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[13px] text-muted-foreground">{label}</p>
      <p className={`tabular mt-0.5 text-xl font-semibold tracking-tight ${muted ? "text-subtle" : ""}`}>{value}</p>
      <div className="mt-1 h-5">{delta}</div>
    </div>
  );
}

export async function SiteCard({ row, alerts }: { row: SiteRow; alerts: Alert[] }) {
  const { t, f } = await getI18n();
  const verdict = siteVerdict(row, alerts);
  const na = (mapped: boolean) => <span className="text-sm font-normal">{mapped ? t.siteCard.waiting : t.siteCard.notConnected}</span>;
  const trend = row.gsc?.clicksSeries.values ?? row.posthog?.visitorsSeries.values ?? null;
  const trendColor = row.gsc ? "var(--c-gsc)" : "var(--c-posthog)";

  return (
    <Link
      href={`/sites/${row.slug}`}
      className="card group flex min-w-0 flex-col gap-4 p-5 transition-shadow hover:shadow-[var(--shadow-lg)] focus-visible:shadow-[var(--shadow-lg)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Favicon domain={row.domain} size={36} />
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-base font-semibold">
              <span className="truncate">{row.name}</span>
              {row.pinned ? <Pin className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden /> : null}
            </p>
            <p className="truncate text-sm text-muted-foreground">{row.domain}</p>
          </div>
        </div>
        <ArrowUpRight className="h-5 w-5 shrink-0 text-subtle transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground" aria-hidden />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={row.health.status} />
        {verdict !== "down" ? <Badge tone={VERDICT_TONE[verdict]}>{t.verdict[verdict]}</Badge> : null}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Metric
          label={t.siteCard.visits}
          value={row.gsc ? f.num(row.gsc.clicks) : na(row.mapped.gsc)}
          muted={!row.gsc}
          delta={row.gsc ? <Delta cur={row.gsc.clicks} prev={row.gsc.clicksPrev} /> : null}
        />
        <Metric
          label={t.siteCard.visitors}
          value={row.posthog ? f.num(row.posthog.visitors) : na(row.mapped.posthog)}
          muted={!row.posthog}
          delta={row.posthog ? <Delta cur={row.posthog.visitors} prev={row.posthog.visitorsPrev} /> : null}
        />
        <Metric
          label={t.siteCard.issues}
          value={row.sentry ? f.num(row.sentry.unresolved) : na(row.mapped.sentry)}
          muted={!row.sentry}
        />
      </div>

      {trend ? (
        <div className="-mx-1 mt-auto">
          <Sparkline values={trend} color={trendColor} height={44} fluid label={row.gsc ? t.siteCard.visits : t.siteCard.visitors} />
        </div>
      ) : null}
    </Link>
  );
}
