import { cookies, headers } from "next/headers";
import { createFormat, isLocale, localeFromHeader, LOCALE_COOKIE, messages, THEME_COOKIE, type Locale, type Theme } from "./index";

export async function getLocale(): Promise<Locale> {
  const c = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(c)) return c;
  return localeFromHeader((await headers()).get("accept-language"));
}

export async function getTheme(): Promise<Theme> {
  const v = (await cookies()).get(THEME_COOKIE)?.value;
  return v === "light" || v === "dark" ? v : "system";
}

/** Messages + formatters for the current request. */
export async function getI18n() {
  const locale = await getLocale();
  return { locale, t: messages(locale), f: createFormat(locale) };
}
