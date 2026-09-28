import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, OctagonAlert } from "lucide-react";
import { Hint } from "./ui-client";

export { Favicon } from "./favicon";
export { Delta, Hint, StatusBadge, type Status } from "./ui-client";

export function Card({ children, className = "", id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={`card min-w-0 ${className}`}>
      {children}
    </section>
  );
}

/** Card title row: title (+ "?" hint) on the left, optional controls on the right. */
export function CardHeader({
  title,
  hint,
  help,
  right,
  dot,
  icon,
}: {
  title: ReactNode;
  hint?: ReactNode;
  help?: ReactNode;
  right?: ReactNode;
  dot?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 px-5 pb-2 pt-4">
      <div className="min-w-0">
        <h3 className="flex items-center gap-2 text-[15px] font-semibold text-foreground">
          {icon}
          {dot ? <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: dot }} aria-hidden /> : null}
          {title}
          {help ? <Hint>{help}</Hint> : null}
        </h3>
        {hint ? <p className="mt-0.5 text-[13px] text-muted-foreground">{hint}</p> : null}
      </div>
      {right}
    </div>
  );
}

/** Page section: a heading with a one-line explanation, then content. */
export function Section({
  title,
  description,
  right,
  children,
  id,
  className = "",
}: {
  title: ReactNode;
  description?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <section id={id} className={`scroll-mt-24 ${className}`}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

export function PageHeader({ title, subtitle, right, flush = false }: { title: ReactNode; subtitle?: ReactNode; right?: ReactNode; flush?: boolean }) {
  return (
    <div className={`${flush ? "" : "mb-8"} flex flex-wrap items-end justify-between gap-4`}>
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">{title}</h1>
        {subtitle ? <div className="mt-1.5 text-[15px] text-muted-foreground">{subtitle}</div> : null}
      </div>
      {right ? <div className="flex flex-wrap items-center gap-2">{right}</div> : null}
    </div>
  );
}

/** A headline number with its plain-language label, explanation and trend. */
export function Stat({
  label,
  help,
  value,
  delta,
  footnote,
  color,
  chart,
  className = "",
}: {
  label: ReactNode;
  help?: ReactNode;
  value: ReactNode;
  delta?: ReactNode;
  footnote?: ReactNode;
  color?: string;
  chart?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`card flex min-w-0 flex-col gap-2 p-5 ${className}`}>
      <p className="flex items-start gap-1.5 text-sm font-medium leading-tight text-muted-foreground">
        {color ? <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden /> : null}
        <span className="min-w-0">{label}</span>
        {help ? <Hint>{help}</Hint> : null}
      </p>
      <div className="flex items-end justify-between gap-3">
        <p className="tabular truncate text-2xl font-semibold leading-none tracking-tight sm:text-[28px]">{value}</p>
        {chart}
      </div>
      {delta || footnote ? (
        <div className="flex min-h-5 flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
          {delta}
          {footnote ? <span className="min-w-0">{footnote}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

const TONE = {
  info: { cls: "border-info/25 bg-info-soft text-info", Icon: Info },
  good: { cls: "border-good/25 bg-good-soft text-good", Icon: CheckCircle2 },
  warning: { cls: "border-warning/30 bg-warning-soft text-warning", Icon: AlertTriangle },
  bad: { cls: "border-destructive/30 bg-destructive-soft text-destructive", Icon: OctagonAlert },
} as const;

/** Inline message with an icon (never color alone). */
export function Notice({ tone = "info", children, className = "" }: { tone?: keyof typeof TONE; children: ReactNode; className?: string }) {
  const { cls, Icon } = TONE[tone];
  return (
    <div className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm ${cls} ${className}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 text-foreground">{children}</div>
    </div>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "warning" | "bad" | "info" }) {
  const cls = {
    neutral: "bg-muted text-muted-foreground",
    good: "bg-good-soft text-good",
    warning: "bg-warning-soft text-warning",
    bad: "bg-destructive-soft text-destructive",
    info: "bg-info-soft text-info",
  }[tone];
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}

export function Empty({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`px-5 py-10 text-center text-sm text-muted-foreground ${className}`}>{children}</div>;
}
