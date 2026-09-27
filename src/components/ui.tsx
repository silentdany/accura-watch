import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { pctChange } from "@/lib/format";

export { Favicon } from "./favicon";

export function Card({
  children,
  className = "",
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={`min-w-0 rounded-[var(--radius-md)] border border-border bg-card ${className}`}>
      {children}
    </section>
  );
}

export function CardHeader({ title, hint, right, dot }: { title: ReactNode; hint?: ReactNode; right?: ReactNode; dot?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
      <div className="min-w-0">
        <h3 className="flex items-center gap-2 text-[13px] font-medium text-foreground">
          {dot ? <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: dot }} aria-hidden /> : null}
          {title}
        </h3>
        {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      {right}
    </div>
  );
}

/**
 * Period-over-period change. `invert` for metrics where lower is better
 * (position, errors). Shows an arrow + sign so it never relies on color alone.
 */
export function Delta({
  cur,
  prev,
  invert = false,
  mode = "pct",
  className = "",
}: {
  cur: number | null | undefined;
  prev: number | null | undefined;
  invert?: boolean;
  mode?: "pct" | "abs";
  className?: string;
}) {
  if (cur == null || prev == null || !Number.isFinite(cur) || !Number.isFinite(prev)) {
    return <span className={`text-[11px] text-subtle ${className}`}>—</span>;
  }
  const change = mode === "pct" ? pctChange(cur, prev) : cur - prev;
  if (change == null) return <span className={`text-[11px] text-subtle ${className}`}>new</span>;
  const flat = Math.abs(change) < (mode === "pct" ? 0.005 : 0.05);
  const good = invert ? change < 0 : change > 0;
  const Icon = flat ? Minus : change > 0 ? ArrowUpRight : ArrowDownRight;
  const color = flat ? "text-muted-foreground" : good ? "text-primary" : "text-destructive";
  const label =
    mode === "pct"
      ? `${change > 0 ? "+" : ""}${Math.abs(change) >= 10 ? Math.round(change * 100) : (change * 100).toFixed(Math.abs(change) < 0.1 ? 1 : 0)}%`
      : `${change > 0 ? "+" : ""}${change.toFixed(1)}`;
  return (
    <span className={`tabular inline-flex items-center gap-0.5 text-[11px] font-medium ${color} ${className}`}>
      <Icon className="h-3 w-3" strokeWidth={2.25} aria-hidden />
      {label}
    </span>
  );
}

export type Status = "up" | "down" | "unknown";

export function StatusDot({ status, className = "" }: { status: Status; className?: string }) {
  const cls =
    status === "up"
      ? "bg-primary shadow-[0_0_8px_hsl(158_70%_55%/0.6)]"
      : status === "down"
        ? "bg-destructive shadow-[0_0_8px_hsl(0_72%_60%/0.7)] animate-pulse"
        : "bg-subtle";
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${cls} ${className}`} title={status} aria-label={status} />;
}

export function Pill({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "good" | "warn" | "bad" }) {
  const cls = {
    default: "border-border-strong text-muted-foreground",
    good: "border-primary/30 bg-primary/10 text-primary",
    warn: "border-warning/30 bg-warning/10 text-warning",
    bad: "border-destructive/30 bg-destructive/10 text-destructive",
  }[tone];
  return <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] ${cls}`}>{children}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-4 py-8 text-center text-sm text-muted-foreground">{children}</p>;
}

export function PageHeader({ title, subtitle, right }: { title: ReactNode; subtitle?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {right ? <div className="flex flex-wrap items-center gap-2">{right}</div> : null}
    </div>
  );
}
