import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { I18nProvider } from "@/i18n/client";
import { getLocale, getTheme } from "@/i18n/server";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Accura Watch", template: "%s · Accura Watch" },
  description:
    "Open-source, MCP-native dashboard for all your sites — Search Console, PostHog, Sentry, uptime and domain SEO at a glance.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [locale, theme] = await Promise.all([getLocale(), getTheme()]);
  return (
    <html lang={locale} data-theme={theme === "system" ? undefined : theme}>
      <body className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-background text-[15px] text-foreground antialiased`}>
        <I18nProvider locale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
