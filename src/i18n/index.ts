import { en } from "./en";
import { fr, type Messages } from "./fr";

export type { Messages };
export const LOCALES = ["fr", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "fr";
export const LOCALE_COOKIE = "aw_locale";
export const THEME_COOKIE = "aw_theme";
export type Theme = "system" | "light" | "dark";

export const LOCALE_NAMES: Record<Locale, string> = { fr: "Français", en: "English" };

const MESSAGES: Record<Locale, Messages> = { fr, en };

export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (LOCALES as readonly string[]).includes(v);
}

export function messages(locale: Locale): Messages {
  return MESSAGES[locale];
}

/** Pick a locale from an Accept-Language header (first supported language wins). */
export function localeFromHeader(header: string | null | undefined): Locale {
  for (const part of (header ?? "").split(",")) {
    const lang = part.trim().slice(0, 2).toLowerCase();
    if (isLocale(lang)) return lang;
  }
  return DEFAULT_LOCALE;
}

export type Format = ReturnType<typeof createFormat>;

/** Locale-aware number, percent and date formatting. */
export function createFormat(locale: Locale) {
  const t = messages(locale);
  const full = new Intl.NumberFormat(locale);
  const compact = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 });
  const ok = (n: number | null | undefined): n is number => n != null && Number.isFinite(n);

  const num = (n: number | null | undefined, opts: { compact?: boolean } = {}) =>
    !ok(n) ? "—" : opts.compact === false || Math.abs(n) < 10_000 ? full.format(Math.round(n)) : compact.format(n);

  const pct = (n: number | null | undefined, digits = 1) =>
    !ok(n) ? "—" : new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(n);

  const dec = (n: number | null | undefined, digits = 1) =>
    !ok(n) ? "—" : new Intl.NumberFormat(locale, { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n);

  const ms = (n: number | null | undefined) => (!ok(n) ? "—" : n >= 1000 ? `${dec(n / 1000, 1)} s` : `${Math.round(n)} ms`);

  const toDate = (s: string | Date) => (s instanceof Date ? s : new Date(s.length === 10 ? `${s}T00:00:00Z` : s));
  const date = (s: string | Date) => toDate(s).toLocaleDateString(locale, { month: "short", day: "numeric", timeZone: "UTC" });
  const dateLong = (s: string | Date) => toDate(s).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const monthYear = (s: string | Date) => toDate(s).toLocaleDateString(locale, { month: "short", year: "numeric", timeZone: "UTC" });
  const dateTime = (s: string | Date) => toDate(s).toLocaleString(locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

  const ago = (d: Date | string | null | undefined) => {
    if (!d) return t.time.never;
    const sec = Math.round((Date.now() - toDate(d).getTime()) / 1000);
    if (sec < 45) return t.time.justNow;
    const min = Math.round(sec / 60);
    if (min < 60) return t.time.minAgo(min);
    const hr = Math.round(min / 60);
    if (hr < 36) return t.time.hoursAgo(hr);
    return t.time.daysAgo(Math.round(hr / 24));
  };

  /** Relative change as a signed percent ("+12 %"), null when growing from zero. */
  const change = (cur: number, prev: number) => {
    if (!prev) return null;
    const c = (cur - prev) / prev;
    return `${c > 0 ? "+" : c < 0 ? "−" : ""}${pct(Math.abs(c), Math.abs(c) < 0.1 ? 1 : 0)}`;
  };

  return { locale, num, pct, dec, ms, date, dateLong, monthYear, dateTime, ago, change };
}
