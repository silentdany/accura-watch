"use client";

import { createContext, useContext, useMemo } from "react";
import { createFormat, messages, type Locale } from "./index";

const Ctx = createContext<Locale>("fr");

export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <Ctx.Provider value={locale}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const locale = useContext(Ctx);
  return useMemo(() => ({ locale, t: messages(locale), f: createFormat(locale) }), [locale]);
}
