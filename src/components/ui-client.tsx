"use client";

import { useId, type ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, CircleHelp, Minus } from "lucide-react";
import { useI18n } from "@/i18n/client";

/**
 * Period-over-period change as a soft pill. `invert` for metrics where lower is better
 * (position, errors). Arrow + sign + color, so it never relies on color alone.
 */
export function Delta({
  cur,
  prev,
  invert = false,
  mode = "pct",
  suffix,
}: {
  cur: number | null | undefined;
  prev: number | null | undefined;
  invert?: boolean;
  mode?: "pct" | "abs";
  /** Text after the pill, e.g. "vs the previous 28 days". */
  suffix?: ReactNode;
}) {
  const { t, f } = useI18n();
  if (cur == null || prev == null || !Number.isFinite(cur) || !Number.isFinite(prev)) return null;
  const change = mode === "pct" ? (prev ? (cur - prev) / prev : null) : cur - prev;
  if (change == null) {
    return cur ? (
      <span className="inline-flex items-center gap-1.5">
        <span className="rounded-full bg-info-soft px-2 py-0.5 text-xs font-medium text-info">{t.trend.new}</span>
        {suffix}
      </span>
    ) : null;
  }
  const flat = Math.abs(change) < (mode === "pct" ? 0.01 : 0.05);
  const good = invert ? change < 0 : change > 0;
  const Icon = flat ? Minus : change > 0 ? ArrowUpRight : ArrowDownRight;
  const cls = flat ? "bg-muted text-muted-foreground" : good ? "bg-good-soft text-good" : "bg-destructive-soft text-destructive";
  const sign = change > 0 ? "+" : change < 0 ? "−" : "";
  const label = mode === "pct" ? `${sign}${f.pct(Math.abs(change), Math.abs(change) < 0.1 ? 1 : 0)}` : `${sign}${f.dec(Math.abs(change), 1)}`;
  const word = flat ? t.trend.flat : change > 0 ? t.trend.up : t.trend.down;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`tabular relative inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-semibold ${cls}`} title={word}>
        <Icon className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
        {flat ? (
          word
        ) : (
          <>
            <span className="sr-only">{word} </span>
            {label}
          </>
        )}
      </span>
      {suffix ? <span className="hidden text-[13px] text-muted-foreground sm:inline">{suffix}</span> : null}
    </span>
  );
}

/** "?" button revealing a plain-language explanation on hover, focus or tap. */
export function Hint({ children, align = "center" }: { children: ReactNode; align?: "start" | "center" | "end" }) {
  const { t } = useI18n();
  const id = useId();
  const pos = align === "start" ? "left-0" : align === "end" ? "right-0" : "left-1/2 -translate-x-1/2";
  return (
    <span className="group relative inline-flex align-middle">
      <button
        type="button"
        aria-describedby={id}
        aria-label={t.common.whatIsThis}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-subtle transition-colors hover:text-foreground focus-visible:text-foreground"
      >
        <CircleHelp className="h-4 w-4" strokeWidth={1.75} />
      </button>
      <span
        id={id}
        role="tooltip"
        className={`pointer-events-none absolute bottom-full z-50 mb-2 hidden w-64 max-w-[calc(100vw-2rem)] rounded-lg bg-popover px-3 py-2.5 text-left text-[13px] font-normal leading-snug text-popover-foreground shadow-[var(--shadow-lg)] group-focus-within:block group-hover:block ${pos}`}
      >
        {children}
      </span>
    </span>
  );
}

export type Status = "up" | "down" | "unknown";

/** Online / offline pill with a dot and a word. */
export function StatusBadge({ status, compact = false }: { status: Status; compact?: boolean }) {
  const { t } = useI18n();
  const map = {
    up: { cls: "bg-good-soft text-good", dot: "bg-good", label: t.status.up },
    down: { cls: "bg-destructive-soft text-destructive", dot: "bg-destructive animate-pulse", label: t.status.down },
    unknown: { cls: "bg-muted text-muted-foreground", dot: "bg-subtle", label: t.status.unknown },
  }[status];
  if (compact) {
    return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${map.dot}`} title={map.label} aria-label={map.label} role="img" />;
  }
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${map.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${map.dot}`} aria-hidden />
      {map.label}
    </span>
  );
}
