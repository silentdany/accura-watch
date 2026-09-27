import type { ReactNode } from "react";
import type { AuthorityPoint, Correlation, QueryOpportunity, SiteInsights } from "@/lib/insights";
import { ago } from "@/lib/dates";
import { fmtNum, fmtPct, fmtPos } from "@/lib/format";
import { Card, CardHeader, Delta, Empty, Pill } from "./ui";
import { KpiTile } from "./kpi";
import { Sparkline } from "./sparkline";

// ─── Cross-source ratios ────────────────────────────────────────────────────

export function InsightTiles({ i }: { i: SiteInsights }) {
  const share = i.searchShare;
  const sov = i.shareOfVoice;
  return (
    <div className="mb-3 grid grid-cols-2 gap-3 xl:grid-cols-4">
      <KpiTile
        label="Visitors from Google"
        color="var(--c-gsc)"
        value={share ? fmtPct(share.value, 0) : "—"}
        delta={share ? <Delta cur={share.value} prev={share.prev} /> : undefined}
        hint={
          !share
            ? "Needs Search Console + PostHog"
            : share.value > 1
              ? "Over 100%: analytics misses part of the visits (ad blockers?)"
              : "Search clicks ÷ visitors"
        }
      />
      <KpiTile
        label="Errors per 1k visitors"
        color="var(--c-sentry)"
        value={i.errorsPer1k ? i.errorsPer1k.value.toFixed(1) : "—"}
        delta={i.errorsPer1k ? <Delta cur={i.errorsPer1k.value} prev={i.errorsPer1k.prev} invert /> : undefined}
        hint={i.errorsPer1k ? "Sentry events ÷ PostHog visitors" : "Needs Sentry + PostHog"}
      />
      <KpiTile
        label="Share of voice"
        color="var(--c-gsc)"
        value={sov ? fmtPct(sov.value, sov.value < 0.1 ? 1 : 0) : "—"}
        hint={
          !sov
            ? "Needs Search Console + DataForSEO keywords"
            : sov.value > 1
              ? "Over 100%: several of your pages show per search"
              : `Your impressions ÷ search volume, ${sov.queries} top queries`
        }
      />
      <KpiTile
        label="Clicks per referring domain"
        color="var(--c-seo)"
        value={i.clicksPerReferringDomain != null ? i.clicksPerReferringDomain.toFixed(1) : "—"}
        hint={i.clicksPerReferringDomain != null ? "28-day search clicks ÷ referring domains" : "Needs Search Console + backlinks"}
      />
    </div>
  );
}

// ─── Correlations ───────────────────────────────────────────────────────────

const STRENGTH_OPACITY: Record<Correlation["strength"], number> = { strong: 1, moderate: 0.75, weak: 0.5, none: 0.25 };

function RBar({ r, strength }: { r: number; strength: Correlation["strength"] }) {
  // Centered bar: left of the midline = negative link, right = positive.
  const w = Math.min(1, Math.abs(r)) * 50;
  return (
    <div className="relative h-1.5 w-20 shrink-0 rounded-full bg-muted" aria-hidden>
      <span className="absolute inset-y-[-2px] left-1/2 w-px bg-border-strong" />
      <span
        className="absolute inset-y-0 rounded-full bg-foreground"
        style={{ left: r < 0 ? `${50 - w}%` : "50%", width: `${w}%`, opacity: STRENGTH_OPACITY[strength] }}
      />
    </div>
  );
}

export function CorrelationsCard({ i }: { i: SiteInsights }) {
  return (
    <Card>
      <CardHeader
        title="What moves together"
        hint={`Daily values over the last ${i.correlationWindowDays} days (links: weekly over a year), detrended so shared growth doesn't count`}
      />
      {i.correlations.length ? (
        <ul className="divide-y divide-border/60">
          {i.correlations.map((c) => (
            <li key={`${c.driver}-${c.outcome}`} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className={`text-sm ${c.strength === "none" ? "text-muted-foreground" : ""}`}>{c.sentence}</p>
                <p className="tabular mt-0.5 text-[11px] text-subtle">
                  r = {c.r.toFixed(2)}
                  {c.lag ? ` · ${c.lag}-${c.unit} lag` : ""} · {c.days} {c.unit}s
                </p>
              </div>
              <RBar r={c.r} strength={c.strength} />
              <span className="w-16 shrink-0 text-right">
                {c.strength === "none" ? <span className="text-[11px] text-subtle">none</span> : <Pill>{c.strength}</Pill>}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>Needs at least 3 weeks of daily data from two sources.</Empty>
      )}
    </Card>
  );
}

// ─── Search opportunities ───────────────────────────────────────────────────

function OppList({ title, hint, rows, render }: { title: string; hint: string; rows: QueryOpportunity[]; render: (o: QueryOpportunity) => ReactNode }) {
  return (
    <div>
      <p className="px-4 pt-3 text-xs font-medium">{title}</p>
      <p className="px-4 text-[11px] text-subtle">{hint}</p>
      {rows.length ? (
        <ul className="mt-1.5">
          {rows.map((o) => (
            <li key={o.query} className="px-4 py-1.5 hover:bg-card-hover">
              <p className="truncate text-sm" title={o.query}>
                {o.query}
              </p>
              <p className="tabular text-xs text-muted-foreground">{render(o)}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-4 py-3 text-xs text-muted-foreground">Nothing stands out.</p>
      )}
    </div>
  );
}

const kwMeta = (o: QueryOpportunity) =>
  [o.volume != null ? `${fmtNum(o.volume)}/mo` : null, o.difficulty != null ? `KD ${o.difficulty}` : null, o.intent].filter(Boolean).join(" · ");

export function OpportunitiesCard({ i }: { i: SiteInsights }) {
  return (
    <Card>
      <CardHeader
        title="Search opportunities"
        dot="var(--c-gsc)"
        hint={
          i.intentMix.length
            ? `Top queries, last 28 days · clicks by intent: ${i.intentMix.map((x) => `${x.intent} ${fmtPct(x.share, 0)}`).join(", ")}`
            : "Top queries, last 28 days"
        }
      />
      <div className="grid grid-cols-1 gap-2 pb-3 md:grid-cols-2">
        <OppList
          title="Low CTR for their position"
          hint="CTR under 60% of the typical rate: rework title & description"
          rows={i.ctrGaps}
          render={(o) => (
            <>
              pos {fmtPos(o.position)} · CTR {fmtPct(o.ctr)} vs {fmtPct(o.expectedCtr, 0)} typical · <span className="text-foreground">+{fmtNum(o.missedClicks)} clicks</span>
              {kwMeta(o) ? <span className="block text-subtle">{kwMeta(o)}</span> : null}
            </>
          )}
        />
        <OppList
          title="Striking distance"
          hint="Positions 11–20 with impressions: page 1 is close"
          rows={i.strikingDistance}
          render={(o) => (
            <>
              pos {fmtPos(o.position)} · {fmtNum(o.impressions)} impressions · <span className="text-foreground">~+{fmtNum(o.missedClicks)} clicks on page 1</span>
              {kwMeta(o) ? <span className="block text-subtle">{kwMeta(o)}</span> : null}
            </>
          )}
        />
      </div>
    </Card>
  );
}

// ─── Pages: search vs all traffic ───────────────────────────────────────────

export function PagesJoinCard({ i }: { i: SiteInsights }) {
  return (
    <Card>
      <CardHeader title="Search's share per page" hint="Search Console clicks vs PostHog visitors, last 28 days" />
      {i.pages.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-4 py-2 text-left font-medium">Page</th>
                <th className="px-3 py-2 text-right font-medium">Search</th>
                <th className="px-3 py-2 text-right font-medium">Visitors</th>
                <th className="px-4 py-2 text-left font-medium">From search</th>
              </tr>
            </thead>
            <tbody>
              {i.pages.map((p) => {
                const s = p.searchShare;
                return (
                  <tr key={p.path} className="border-b border-border/60 last:border-0 hover:bg-card-hover">
                    <td className="max-w-[220px] truncate px-4 py-2" title={p.path}>
                      {p.path}
                    </td>
                    <td className="tabular px-3 py-2 text-right">{p.searchClicks != null ? fmtNum(p.searchClicks) : <span className="text-subtle">—</span>}</td>
                    <td className="tabular px-3 py-2 text-right text-muted-foreground">{p.visitors != null ? fmtNum(p.visitors) : <span className="text-subtle">—</span>}</td>
                    <td className="px-4 py-2">
                      {s != null ? (
                        <span className="flex items-center gap-2">
                          <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                            <span className="block h-full rounded-full" style={{ width: `${Math.min(1, s) * 100}%`, background: "var(--c-gsc)" }} />
                          </span>
                          <span className="tabular text-xs text-muted-foreground">{s > 1 ? ">100%" : fmtPct(s, 0)}</span>
                        </span>
                      ) : (
                        <span className="text-[11px] text-subtle">{p.searchClicks == null ? "not a top search page" : "no visitors tracked"}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>Needs Search Console and PostHog top pages.</Empty>
      )}
    </Card>
  );
}

// ─── Authority at a glance ──────────────────────────────────────────────────

function last2(pts: AuthorityPoint[]) {
  return [pts.at(-1)?.value ?? null, pts.at(-2)?.value ?? null] as const;
}

function AuthorityRow({ label, pts, format }: { label: string; pts: AuthorityPoint[]; format: (v: number) => string }) {
  const [cur, prev] = last2(pts);
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2">
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="tabular flex items-baseline gap-2 text-sm font-semibold">
          {cur != null ? format(cur) : "—"} <Delta cur={cur} prev={prev} />
        </p>
      </div>
      <Sparkline values={pts.map((p) => p.value)} color="var(--c-seo)" width={80} height={24} fill={false} label={`${label} history`} />
    </div>
  );
}

export function AuthorityGlance({ i }: { i: SiteInsights }) {
  const a = i.authority;
  const [cur, prev] = last2(a.score);
  const scale = a.label === "OPR" ? (v: number) => (v / 10).toFixed(1) : (v: number) => String(Math.round(v));
  const since = a.score[0]?.date ?? a.referringDomains[0]?.date;
  return (
    <Card className="flex flex-col">
      <CardHeader
        title="Authority"
        dot="var(--c-seo)"
        hint={since ? `History since ${since}` : undefined}
        right={
          <a href="#seo" className="text-xs text-muted-foreground hover:text-foreground">
            Details ↓
          </a>
        }
      />
      {a.score.length || a.referringDomains.length ? (
        <div className="flex flex-1 flex-col justify-center divide-y divide-border/60">
          {a.score.length ? (
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="text-[11px] text-muted-foreground">{a.label === "DR" ? "Ahrefs Domain Rating" : a.label === "Rank" ? "Domain rank" : "Open PageRank"}</p>
                <p className="tabular flex items-baseline gap-2 text-3xl font-semibold tracking-tight">
                  {cur != null ? scale(cur) : "—"}
                  <span className="text-xs font-normal text-subtle">/{a.label === "OPR" ? "10" : "100"}</span>
                  <Delta cur={cur} prev={prev} mode="abs" />
                </p>
              </div>
              <Sparkline values={a.score.map((p) => p.value)} color="var(--c-seo)" width={96} height={36} label="Authority history" />
            </div>
          ) : null}
          {a.referringDomains.length ? <AuthorityRow label="Referring domains" pts={a.referringDomains} format={(v) => fmtNum(v)} /> : null}
          {a.organicKeywords.length ? <AuthorityRow label="Ranking keywords" pts={a.organicKeywords} format={(v) => fmtNum(v)} /> : null}
          {i.links28d ? (
            <div className="flex items-center justify-between gap-3 px-4 py-2">
              <p className="text-[11px] text-muted-foreground">Referring domains, last 28 days</p>
              <p className="tabular text-sm font-semibold">
                <span className="text-primary">+{fmtNum(i.links28d.gained)}</span> <span className="text-subtle">/</span>{" "}
                <span className="text-destructive">−{fmtNum(i.links28d.lost)}</span>
              </p>
            </div>
          ) : null}
        </div>
      ) : (
        <Empty>No authority data yet.</Empty>
      )}
    </Card>
  );
}

// ─── Competitors & content gaps ─────────────────────────────────────────────

export function CompetitorsCard({ i }: { i: SiteInsights }) {
  const cal = i.calibration;
  return (
    <Card>
      <CardHeader
        title="Competitors"
        dot="var(--c-seo)"
        hint={
          cal
            ? `Traffic calibrated: your real clicks run ${cal.ratio >= 1 ? `${cal.ratio.toFixed(1)}× above` : `${(1 / cal.ratio).toFixed(1)}× below`} DataForSEO's estimate${cal.months ? ` (median of ${cal.months} months)` : ""}`
            : "Organic competitors by shared keywords"
        }
      />
      {i.competitors.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[380px] text-sm">
            <thead className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-4 py-2 text-left font-medium">Domain</th>
                <th className="px-3 py-2 text-right font-medium">Shared kw</th>
                <th className="px-4 py-2 text-right font-medium">{cal ? "Real traffic (est.)" : "Est. traffic"}</th>
              </tr>
            </thead>
            <tbody>
              {i.competitors.slice(0, 8).map((c) => (
                <tr key={c.domain} className="border-b border-border/60 last:border-0 hover:bg-card-hover">
                  <td className="max-w-[200px] truncate px-4 py-2" title={c.domain}>
                    {c.domain}
                  </td>
                  <td className="tabular px-3 py-2 text-right text-muted-foreground">{fmtNum(c.sharedKeywords)}</td>
                  <td className="tabular px-4 py-2 text-right" title={`DataForSEO estimate: ${fmtNum(c.etv)}/mo`}>
                    {fmtNum(c.calibratedTraffic ?? c.etv)}
                    <span className="text-[11px] text-subtle">/mo</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>No competitor data yet (collected monthly with DataForSEO).</Empty>
      )}
    </Card>
  );
}

export function ContentGapsCard({ i }: { i: SiteInsights }) {
  return (
    <Card>
      <CardHeader
        title="Content gaps"
        dot="var(--c-seo)"
        hint={`Keywords your top competitors rank for and you don't${i.competitorsUpdatedAt ? ` · updated ${ago(i.competitorsUpdatedAt)}` : ""}`}
      />
      {i.contentGaps.length ? (
        <ul className="divide-y divide-border/60">
          {i.contentGaps.map((g) => (
            <li key={g.keyword} className="px-4 py-2 hover:bg-card-hover">
              <p className="flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate" title={g.keyword}>
                  {g.keyword}
                </span>
                <span className="tabular shrink-0 text-xs">{g.volume != null ? `${fmtNum(g.volume)}/mo` : "—"}</span>
              </p>
              <p className="tabular truncate text-xs text-muted-foreground">
                {g.competitors > 1 ? `${g.competitors} competitors` : g.competitor}
                {g.competitorRank ? ` · best rank ${g.competitorRank}` : ""}
                {g.difficulty != null ? ` · KD ${g.difficulty}` : ""}
                {g.intent ? ` · ${g.intent}` : ""}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>No gaps yet (collected monthly with DataForSEO).</Empty>
      )}
    </Card>
  );
}
