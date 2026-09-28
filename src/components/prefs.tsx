"use client";

import { useTransition } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { setLocaleAction, setThemeAction } from "@/app/actions";
import { LOCALES, type Locale, type Theme } from "@/i18n";
import { useI18n } from "@/i18n/client";

function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string; icon?: React.ReactNode }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-border bg-muted p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          title={o.label}
          onClick={() => onChange(o.value)}
          className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
            o.value === value ? "bg-card text-foreground shadow-[var(--shadow)]" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {o.icon}
          {o.icon ? <span className="sr-only">{o.label}</span> : o.label}
        </button>
      ))}
    </div>
  );
}

export function LocaleSwitch() {
  const { locale, t } = useI18n();
  const [, start] = useTransition();
  const set = (v: Locale) => {
    const fd = new FormData();
    fd.set("locale", v);
    start(() => setLocaleAction(fd));
  };
  return <Segmented label={t.settings.language} value={locale} onChange={set} options={LOCALES.map((l) => ({ value: l, label: l.toUpperCase() }))} />;
}

export function ThemeSwitch({ value, withLabels = false }: { value: Theme; withLabels?: boolean }) {
  const { t } = useI18n();
  const [, start] = useTransition();
  const set = (v: Theme) => {
    // Apply instantly, then persist.
    if (v === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", v);
    const fd = new FormData();
    fd.set("theme", v);
    start(() => setThemeAction(fd));
  };
  const icon = (I: typeof Sun) => <I className="h-3.5 w-3.5" strokeWidth={2} />;
  return (
    <Segmented
      label={t.settings.theme}
      value={value}
      onChange={set}
      options={[
        { value: "system", label: t.settings.themes.system, icon: withLabels ? undefined : icon(Monitor) },
        { value: "light", label: t.settings.themes.light, icon: withLabels ? undefined : icon(Sun) },
        { value: "dark", label: t.settings.themes.dark, icon: withLabels ? undefined : icon(Moon) },
      ]}
    />
  );
}
