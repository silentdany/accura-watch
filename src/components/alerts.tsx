import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, Info, OctagonAlert } from "lucide-react";
import type { Alert } from "@/lib/metrics";
import type { Format, Messages } from "@/i18n";
import { getI18n } from "@/i18n/server";
import { Card, CardHeader, Favicon } from "./ui";

/** Plain-language text + recommended action for an alert, in the user's language. */
export function describeAlert(a: Alert, t: Messages, f: Format): { text: string; action: string; tab: string } {
  const pct = (x?: number) => f.pct(Math.abs(x ?? 0), 0);
  const src = (s: string) => (t.sources as Record<string, string>)[s] ?? s;
  switch (a.kind) {
    case "down":
      return { text: t.alerts.down.text(a.data.error ?? ""), action: t.alerts.down.action, tab: "health" };
    case "tls":
      return { text: t.alerts.tls.text(a.data.days ?? 0), action: t.alerts.tls.action, tab: "health" };
    case "uptime":
      return { text: t.alerts.uptime.text(f.pct(a.data.ratio ?? 0, 1)), action: t.alerts.uptime.action, tab: "health" };
    case "clicksDrop":
      return { text: t.alerts.clicksDrop.text(pct(a.data.change)), action: t.alerts.clicksDrop.action, tab: "google" };
    case "visitorsDrop":
      return { text: t.alerts.visitorsDrop.text(pct(a.data.change)), action: t.alerts.visitorsDrop.action, tab: "visitors" };
    case "errorSpike":
      return {
        text: t.alerts.errorSpike.text(a.data.factor ? f.dec(a.data.factor, 1) : "∞", f.num(a.data.count ?? 0)),
        action: t.alerts.errorSpike.action,
        tab: "health",
      };
    case "syncFailing":
      return {
        // Raw provider errors can be huge JSON blobs: keep a readable excerpt, the full text is under Manage sites.
        text: `${t.alerts.syncFailing.text(src(a.source))}${a.data.error ? ` ${a.data.error.length > 140 ? `${a.data.error.slice(0, 140)}…` : a.data.error}` : ""}`,
        action: t.alerts.syncFailing.action,
        tab: "settings",
      };
  }
}

const ICON = {
  critical: { Icon: OctagonAlert, cls: "bg-destructive-soft text-destructive" },
  warning: { Icon: AlertTriangle, cls: "bg-warning-soft text-warning" },
  info: { Icon: Info, cls: "bg-info-soft text-info" },
};

/** "What needs your attention": one row per alert, with the fix to apply and a link to it. */
export async function AlertList({ alerts, withSite = true, max = 8 }: { alerts: Alert[]; withSite?: boolean; max?: number }) {
  const { t, f } = await getI18n();
  const shown = alerts.slice(0, max);
  return (
    <Card>
      <CardHeader title={t.alerts.title} />
      {shown.length ? (
        <ul className="divide-y divide-border px-2 pb-2">
          {shown.map((a, i) => {
            const d = describeAlert(a, t, f);
            const { Icon, cls } = ICON[a.severity];
            const href = d.tab === "settings" ? "/settings" : `/sites/${a.site}?tab=${d.tab}`;
            return (
              <li key={i}>
                <Link href={href} className="group flex items-start gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-muted">
                  <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${cls}`}>
                    <Icon className="h-4 w-4" aria-hidden />
                    <span className="sr-only">{t.alerts.severity[a.severity]}</span>
                  </span>
                  <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                    {withSite ? (
                      <span className="mb-0.5 flex items-center gap-1.5 text-sm font-semibold">
                        <Favicon domain={a.domain} size={14} />
                        {a.siteName}
                      </span>
                    ) : null}
                    <span className="block text-[15px] leading-snug [overflow-wrap:anywhere]">{d.text}</span>
                    <span className="mt-0.5 block text-sm text-muted-foreground">{d.action}</span>
                  </span>
                  <ArrowRight className="mt-2 h-4 w-4 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="flex items-center gap-2.5 px-5 pb-5 text-[15px] text-muted-foreground">
          <CheckCircle2 className="h-5 w-5 text-good" aria-hidden />
          {t.alerts.none}
        </p>
      )}
    </Card>
  );
}
