import type { ReactNode } from "react";
import { Sparkline } from "./sparkline";

export function KpiTile({
  label,
  value,
  delta,
  hint,
  color,
  spark,
  className = "",
}: {
  label: string;
  value: ReactNode;
  delta?: ReactNode;
  hint?: ReactNode;
  color?: string;
  spark?: number[];
  className?: string;
}) {
  return (
    <div className={`flex min-w-0 flex-col justify-between gap-2 rounded-[var(--radius-md)] border border-border bg-card p-4 ${className}`}>
      <p className="eyebrow flex items-center gap-1.5">
        {color ? <span className="h-1.5 w-1.5 rounded-sm" style={{ background: color }} aria-hidden /> : null}
        {label}
      </p>
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="tabular truncate text-2xl font-semibold tracking-tight">{value}</p>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
            {delta}
            {hint ? <span className="truncate">{hint}</span> : null}
          </div>
        </div>
        {spark && color ? <Sparkline values={spark} color={color} width={72} height={30} /> : null}
      </div>
    </div>
  );
}
