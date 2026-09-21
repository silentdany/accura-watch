export type KpiCardProps = {
  id: string;
  label: string;
  value: string;
  hint: string;
  tone?: "default" | "good" | "warn" | "bad";
};

const toneClass: Record<NonNullable<KpiCardProps["tone"]>, string> = {
  default: "text-foreground",
  good: "text-primary",
  warn: "text-warning",
  bad: "text-destructive",
};

export function KpiCard({ id, label, value, hint, tone = "default" }: KpiCardProps) {
  return (
    <article
      id={id}
      className="rounded-[var(--radius-md)] border border-border bg-card p-5 shadow-[0_1px_0_hsl(0_0%_100%/0.03)_inset]"
    >
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <p className={`mt-3 text-3xl font-semibold tracking-tight ${toneClass[tone]}`}>
        {value}
      </p>
      <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
    </article>
  );
}
