import Link from "next/link";
import { RANGES } from "@/lib/dates";

export function RangeTabs({ value, basePath }: { value: number; basePath: string }) {
  return (
    <div className="inline-flex rounded-lg border border-border-strong bg-card p-0.5" role="tablist" aria-label="Period">
      {RANGES.map((r) => (
        <Link
          key={r}
          href={`${basePath}?range=${r}`}
          role="tab"
          aria-selected={r === value}
          scroll={false}
          className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
            r === value ? "bg-muted text-foreground shadow-[inset_0_0_0_1px_hsl(var(--border-strong))]" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {r}d
        </Link>
      ))}
    </div>
  );
}
