import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Bug,
  BarChart3,
  Search,
  Link2,
} from "lucide-react";

export type KpiCardProps = {
  id: string;
  label: string;
  value: string;
  hint: string;
  tone?: "default" | "good" | "warn" | "bad";
  icon?: LucideIcon;
};

const toneClass: Record<NonNullable<KpiCardProps["tone"]>, string> = {
  default: "text-foreground",
  good: "text-primary",
  warn: "text-warning",
  bad: "text-destructive",
};

const defaultIcons: Record<string, LucideIcon> = {
  health: Activity,
  sentry: Bug,
  posthog: BarChart3,
  gsc: Search,
  ahrefs: Link2,
};

export function KpiCard({
  id,
  label,
  value,
  hint,
  tone = "default",
  icon,
}: KpiCardProps) {
  const Icon = icon ?? defaultIcons[id] ?? Activity;

  return (
    <article
      id={id}
      className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-border bg-card p-4 transition-colors hover:border-primary/30"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </p>
        <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden strokeWidth={1.75} />
      </div>
      <p className={`text-2xl font-semibold tracking-tight ${toneClass[tone]}`}>
        {value}
      </p>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </article>
  );
}
