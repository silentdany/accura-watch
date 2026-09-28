import Link from "next/link";
import type { SiteReport } from "@/lib/metrics";
import type { SiteInsights, AuthorityPoint } from "@/lib/insights";
import { getI18n } from "@/i18n/server";
import { Badge, Card, CardHeader, Delta, Empty, Stat } from "../ui";
import { Sparkline } from "../sparkline";
import { CorrelationList } from "./common";

type SeoDetail = {
  organic?: { keywords: number; etv: number; top3: number; top10: number; trafficCost: number } | null;
  backlinks?: { rank: number; backlinks: number; referringDomains: number; referringMainDomains: number; spamScore: number | null; brokenBacklinks: number | null } | null;
  openPageRank?: { score: number; globalRank: number | null } | null;
  ahrefs?: { domainRating: number } | null;
  errors?: string[];
  collectedAt?: string;
};

const last2 = (pts: AuthorityPoint[]) => [pts.at(-1)?.value ?? null, pts.at(-2)?.value ?? null] as const;

export async function SeoTab({ r, i }: { r: SiteReport; i: SiteInsights }) {
  const { t, f } = await getI18n();
  const a = i.authority;
  const detail = r.seoDetail as SeoDetail | null;
  const [score, scorePrev] = last2(a.score);
  const [rd, rdPrev] = last2(a.referringDomains);
  const [kw, kwPrev] = last2(a.organicKeywords);
  const scoreLabel = a.label === "DR" ? t.seo.drLabel : a.label === "Rank" ? t.seo.rankLabel : a.label === "OPR" ? t.seo.oprLabel : t.metrics.authority.label;
  const scoreText = score == null ? "—" : a.label === "OPR" ? f.dec(score / 10, 1) : String(Math.round(score));
  const spark = (pts: AuthorityPoint[]) => (pts.length > 1 ? <Sparkline values={pts.map((p) => p.value)} color="var(--c-seo)" width={96} height={36} /> : null);
  const since = a.score[0]?.date ?? a.referringDomains[0]?.date ?? a.organicKeywords[0]?.date;
  const links = i.correlations.filter((c) => c.driver === "links");
  const cal = i.calibration;

  if (!detail && !a.score.length && !a.referringDomains.length) {
    return (
      <Card>
        <Empty>
          {t.seo.noData}{" "}
          <Link href="/settings#dataforseo" className="link font-medium">
            {t.seo.connectSeo}
          </Link>
        </Empty>
      </Card>
    );
  }

  const items: { label: string; value: string }[] = [];
  if (detail?.backlinks) {
    items.push({ label: t.seo.backlinks, value: f.num(detail.backlinks.backlinks) });
    if (detail.backlinks.spamScore != null) items.push({ label: t.seo.spamScore, value: `${detail.backlinks.spamScore}/100` });
  }
  if (detail?.organic) {
    items.push(
      { label: t.seo.top10, value: f.num(detail.organic.top10) },
      { label: t.metrics.estimated.label, value: `${f.num(detail.organic.etv)}${t.common.perMonth}` },
      { label: t.seo.trafficValue, value: `${f.num(detail.organic.trafficCost)} $` },
    );
  }
  if (detail?.openPageRank) {
    items.push({ label: t.seo.oprLabel, value: `${f.dec(detail.openPageRank.score, 1)}/10` });
    if (detail.openPageRank.globalRank) items.push({ label: t.seo.globalRank, value: `#${f.num(detail.openPageRank.globalRank)}` });
  }

  return (
    <div className="flex flex-col gap-6">
      {since ? <p className="-mb-2 text-sm text-muted-foreground">{t.seo.authorityHistory(f.dateLong(since))}</p> : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label={scoreLabel}
          help={t.metrics.authority.help}
          color="var(--c-seo)"
          value={
            <>
              {scoreText}
              <span className="text-base font-medium text-subtle">/{a.label === "OPR" ? 10 : 100}</span>
            </>
          }
          chart={spark(a.score)}
          delta={<Delta cur={score} prev={scorePrev} mode="abs" />}
        />
        <Stat label={t.metrics.referringDomains.label} help={t.metrics.referringDomains.help} value={f.num(rd)} chart={spark(a.referringDomains)} delta={<Delta cur={rd} prev={rdPrev} />} />
        <Stat label={t.metrics.keywords.label} help={t.metrics.keywords.help} value={f.num(kw)} chart={spark(a.organicKeywords)} delta={<Delta cur={kw} prev={kwPrev} />} />
        <Stat
          label={t.seo.links28}
          help={t.seo.linksHint}
          value={
            i.links28d ? (
              <>
                <span className="text-good">+{f.num(i.links28d.gained)}</span>
                <span className="text-lg font-medium text-subtle"> / </span>
                <span className="text-destructive">−{f.num(i.links28d.lost)}</span>
              </>
            ) : (
              "—"
            )
          }
          footnote={i.clicksPerReferringDomain != null ? `${t.metrics.clicksPerRd.label} · ${f.dec(i.clicksPerReferringDomain, 1)}` : null}
        />
      </div>

      {links.length ? (
        <Card>
          <CardHeader title={t.correlations.title} hint={t.correlations.hint} />
          <CorrelationList items={links} />
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader
            title={t.seo.competitors}
            hint={
              cal
                ? t.seo.calibrated(f.dec(cal.ratio >= 1 ? cal.ratio : 1 / cal.ratio, 1), cal.ratio >= 1 ? "above" : "below")
                : t.seo.competitorsHint
            }
            help={t.metrics.estimated.help}
          />
          {i.competitors.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[380px] text-[14px]">
                <thead className="text-left text-[13px] text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="px-5 py-2.5 font-medium">{t.seo.domain}</th>
                    <th className="px-3 py-2.5 text-right font-medium">{t.seo.shared}</th>
                    <th className="px-5 py-2.5 text-right font-medium">{t.seo.traffic}</th>
                  </tr>
                </thead>
                <tbody>
                  {i.competitors.slice(0, 8).map((c) => (
                    <tr key={c.domain} className="border-b border-border last:border-0 hover:bg-card-hover">
                      <td className="max-w-[220px] truncate px-5 py-3 font-medium">{c.domain}</td>
                      <td className="tabular px-3 py-3 text-right text-muted-foreground">{f.num(c.sharedKeywords)}</td>
                      <td className="tabular px-5 py-3 text-right" title={`DataForSEO · ${f.num(c.etv)}${t.common.perMonth}`}>
                        {f.num(c.calibratedTraffic ?? c.etv)}
                        <span className="text-[13px] text-subtle">{t.common.perMonth}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>{t.seo.noCompetitors}</Empty>
          )}
        </Card>
        <Card>
          <CardHeader title={t.seo.gaps} hint={i.competitorsUpdatedAt ? `${t.seo.gapsHint} · ${f.ago(i.competitorsUpdatedAt)}` : t.seo.gapsHint} />
          {i.contentGaps.length ? (
            <ul className="flex flex-col gap-2 px-5 pb-5">
              {i.contentGaps.map((g) => (
                <li key={g.keyword} className="rounded-xl border border-border p-3">
                  <p className="flex items-start justify-between gap-3">
                    <span className="min-w-0 break-words font-medium">{g.keyword}</span>
                    {g.volume != null ? <Badge tone="info">{t.opportunities.volume(f.num(g.volume))}</Badge> : null}
                  </p>
                  <p className="mt-1 text-[13px] text-muted-foreground">
                    {g.competitors > 1 ? t.seo.gapShared(g.competitors) : t.seo.gapLine(g.competitor, g.competitorRank)}
                    {g.difficulty != null ? ` · ${t.opportunities.difficulty(g.difficulty)}` : ""}
                    {g.intent ? ` · ${(t.google.intents as Record<string, string>)[g.intent] ?? g.intent}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>{t.seo.noGaps}</Empty>
          )}
        </Card>
      </div>

      {items.length ? (
        <Card>
          <CardHeader title={t.seo.detailTitle} hint={detail?.collectedAt ? t.seo.detailHint(f.ago(detail.collectedAt)) : undefined} />
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 px-5 pb-5 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((it) => (
              <div key={it.label}>
                <dt className="text-[13px] text-muted-foreground">{it.label}</dt>
                <dd className="tabular mt-0.5 text-lg font-semibold">{it.value}</dd>
              </div>
            ))}
          </dl>
          {detail?.errors?.length ? <p className="border-t border-border px-5 py-3 text-[13px] text-warning">{detail.errors.join(" · ")}</p> : null}
        </Card>
      ) : null}
    </div>
  );
}
