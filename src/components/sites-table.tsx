"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Pin } from "lucide-react";
import type { SiteRow } from "@/lib/metrics";
import { fmtMs, fmtNum, fmtPct, fmtPos, pctChange } from "@/lib/format";
import { Delta, Favicon, StatusDot } from "./ui";
import { Sparkline } from "./sparkline";

type SortKey = "name" | "clicks" | "trend" | "impressions" | "ctr" | "position" | "visitors" | "health" | "errors" | "authority";

const val = (r: SiteRow, k: SortKey): number | string => {
  switch (k) {
    case "name":
      return r.name.toLowerCase();
    case "clicks":
      return r.gsc?.clicks ?? -1;
    case "trend":
      return r.gsc ? (pctChange(r.gsc.clicks, r.gsc.clicksPrev) ?? 99) : -99;
    case "impressions":
      return r.gsc?.impressions ?? -1;
    case "ctr":
      return r.gsc?.ctr ?? -1;
    case "position":
      return r.gsc?.position != null ? -r.gsc.position : -999;
    case "visitors":
      return r.posthog?.visitors ?? -1;
    case "health":
      return r.health.status === "down" ? -1 : -(r.health.latencyMs ?? 99_999);
    case "errors":
      return r.sentry?.unresolved ?? -1;
    case "authority":
      return r.seo?.rank ?? r.seo?.opr ?? -1;
  }
};

function Th({
  k,
  sort,
  setSort,
  children,
  align = "right",
  className = "",
}: {
  k: SortKey;
  sort: { key: SortKey; dir: 1 | -1 };
  setSort: (s: { key: SortKey; dir: 1 | -1 }) => void;
  children: React.ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  const active = sort.key === k;
  return (
    <th className={`px-3 py-2.5 font-medium ${align === "right" ? "text-right" : "text-left"} ${className}`}>
      <button
        type="button"
        onClick={() => setSort({ key: k, dir: active ? (sort.dir === 1 ? -1 : 1) : k === "name" ? 1 : -1 })}
        className={`inline-flex items-center gap-1 uppercase tracking-[0.08em] transition-colors hover:text-foreground ${active ? "text-foreground" : ""}`}
      >
        {children}
        {active ? sort.dir === -1 ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" /> : null}
      </button>
    </th>
  );
}

function Na({ hint }: { hint: string }) {
  return (
    <span className="text-[11px] text-subtle" title={hint}>
      —
    </span>
  );
}

export function SitesTable({ rows, range }: { rows: SiteRow[]; range: number }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "clicks", dir: -1 });
  const sorted = useMemo(() => {
    const out = [...rows];
    out.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      const va = val(a, sort.key);
      const vb = val(b, sort.key);
      return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir;
    });
    return out;
  }, [rows, sort]);

  const p = { sort, setSort };
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1080px] border-collapse text-sm">
        <thead className="text-[10px] text-muted-foreground">
          <tr className="border-b border-border">
            <Th k="name" align="left" className="pl-4" {...p}>
              Site
            </Th>
            <Th k="clicks" {...p}>
              <span className="h-1.5 w-1.5 rounded-sm bg-gsc" /> Clicks
            </Th>
            <Th k="trend" {...p}>
              {range}d trend
            </Th>
            <Th k="impressions" {...p}>
              Impr.
            </Th>
            <Th k="ctr" {...p}>
              CTR
            </Th>
            <Th k="position" {...p}>
              Pos.
            </Th>
            <Th k="visitors" {...p}>
              <span className="h-1.5 w-1.5 rounded-sm bg-posthog" /> Visitors
            </Th>
            <Th k="health" {...p}>
              <span className="h-1.5 w-1.5 rounded-sm bg-health" /> Uptime
            </Th>
            <Th k="errors" {...p}>
              <span className="h-1.5 w-1.5 rounded-sm bg-sentry" /> Issues
            </Th>
            <Th k="authority" className="pr-4" {...p}>
              <span className="h-1.5 w-1.5 rounded-sm bg-seo" /> Authority
            </Th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.id} className="group border-b border-border/70 transition-colors last:border-0 hover:bg-card-hover">
              <td className="py-3 pl-4 pr-3">
                <Link href={`/sites/${r.slug}`} className="flex items-center gap-2.5">
                  <Favicon domain={r.domain} size={20} />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 font-medium text-foreground group-hover:text-primary">
                      {r.name}
                      {r.pinned ? <Pin className="h-3 w-3 text-subtle" /> : null}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">{r.domain}</span>
                  </span>
                </Link>
              </td>

              {/* GSC */}
              <td className="px-3 py-3 text-right">
                {r.gsc ? (
                  <div className="flex flex-col items-end">
                    <span className="tabular font-semibold">{fmtNum(r.gsc.clicks)}</span>
                    <Delta cur={r.gsc.clicks} prev={r.gsc.clicksPrev} />
                  </div>
                ) : (
                  <Na hint={r.mapped.gsc ? "Waiting for first sync" : "No Search Console property"} />
                )}
              </td>
              <td className="px-3 py-3">
                <div className="flex justify-end">
                  {r.gsc ? <Sparkline values={r.gsc.clicksSeries.values} color="var(--c-gsc)" width={88} height={26} label={`${r.name} clicks`} /> : null}
                </div>
              </td>
              <td className="px-3 py-3 text-right">
                {r.gsc ? (
                  <div className="flex flex-col items-end">
                    <span className="tabular">{fmtNum(r.gsc.impressions)}</span>
                    <Delta cur={r.gsc.impressions} prev={r.gsc.impressionsPrev} />
                  </div>
                ) : (
                  <Na hint="—" />
                )}
              </td>
              <td className="tabular px-3 py-3 text-right text-muted-foreground">{r.gsc ? fmtPct(r.gsc.ctr) : <Na hint="—" />}</td>
              <td className="px-3 py-3 text-right">
                {r.gsc ? (
                  <div className="flex flex-col items-end">
                    <span className="tabular">{fmtPos(r.gsc.position)}</span>
                    <Delta cur={r.gsc.position} prev={r.gsc.positionPrev} invert mode="abs" />
                  </div>
                ) : (
                  <Na hint="—" />
                )}
              </td>

              {/* PostHog */}
              <td className="px-3 py-3 text-right">
                {r.posthog ? (
                  <div className="flex items-center justify-end gap-3">
                    <Sparkline values={r.posthog.visitorsSeries.values} color="var(--c-posthog)" width={56} height={22} label={`${r.name} visitors`} />
                    <div className="flex flex-col items-end">
                      <span className="tabular font-semibold">{fmtNum(r.posthog.visitors)}</span>
                      <Delta cur={r.posthog.visitors} prev={r.posthog.visitorsPrev} />
                    </div>
                  </div>
                ) : (
                  <Na hint={r.mapped.posthog ? "Waiting for first sync" : "No PostHog project"} />
                )}
              </td>

              {/* Health */}
              <td className="px-3 py-3 text-right">
                <div className="flex flex-col items-end gap-0.5">
                  <span className="flex items-center gap-1.5">
                    <StatusDot status={r.health.status} />
                    <span className={`tabular ${r.health.status === "down" ? "text-destructive" : ""}`}>
                      {r.health.status === "down" ? "down" : r.health.uptime != null ? fmtPct(r.health.uptime, r.health.uptime === 1 ? 0 : 2) : "—"}
                    </span>
                  </span>
                  <span className="tabular text-[11px] text-muted-foreground">
                    {fmtMs(r.health.latencyMs)}
                    {r.health.sslDaysLeft != null && r.health.sslDaysLeft < 21 ? (
                      <span className="ml-1 text-warning">· TLS {r.health.sslDaysLeft}d</span>
                    ) : null}
                  </span>
                </div>
              </td>

              {/* Sentry */}
              <td className="px-3 py-3 text-right">
                {r.sentry ? (
                  <div className="flex flex-col items-end">
                    <span className={`tabular font-semibold ${r.sentry.unresolved > 0 ? "" : "text-muted-foreground"}`}>{fmtNum(r.sentry.unresolved)}</span>
                    <span className="tabular text-[11px] text-muted-foreground">
                      {fmtNum(r.sentry.events)} ev <Delta cur={r.sentry.events} prev={r.sentry.eventsPrev} invert />
                    </span>
                  </div>
                ) : (
                  <Na hint={r.mapped.sentry ? "Waiting for first sync" : "No Sentry project"} />
                )}
              </td>

              {/* SEO */}
              <td className="py-3 pl-3 pr-4 text-right">
                {r.seo ? (
                  <div className="flex flex-col items-end">
                    <span className="tabular font-semibold">
                      {r.seo.rank != null ? Math.round(r.seo.rank) : r.seo.opr != null ? r.seo.opr.toFixed(1) : "—"}
                      <span className="ml-1 text-[10px] font-normal text-subtle">{r.seo.rank != null ? "DR" : r.seo.opr != null ? "OPR" : ""}</span>
                    </span>
                    <span className="tabular text-[11px] text-muted-foreground">
                      {r.seo.referringDomains != null ? `${fmtNum(r.seo.referringDomains)} RD` : ""}
                      {r.seo.referringDomains != null && r.seo.organicKeywords != null ? " · " : ""}
                      {r.seo.organicKeywords != null ? `${fmtNum(r.seo.organicKeywords)} kw` : ""}
                    </span>
                  </div>
                ) : (
                  <Na hint="Connect DataForSEO or Open PageRank" />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
