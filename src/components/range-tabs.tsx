"use client";

import Link from "next/link";
import { RANGES } from "@/lib/dates";
import { useI18n } from "@/i18n/client";

/** Period picker; keeps other query params (e.g. the active tab). */
export function RangeTabs({ value, basePath, query = {} }: { value: number; basePath: string; query?: Record<string, string> }) {
  const { t } = useI18n();
  return (
    <div className="inline-flex rounded-xl border border-border bg-muted p-1" role="radiogroup" aria-label={t.period.label}>
      {RANGES.map((r) => (
        <Link
          key={r}
          href={{ pathname: basePath, query: { ...query, range: r } }}
          role="radio"
          aria-checked={r === value}
          scroll={false}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            r === value ? "bg-card text-foreground shadow-[var(--shadow)]" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {t.period[r]}
        </Link>
      ))}
    </div>
  );
}
