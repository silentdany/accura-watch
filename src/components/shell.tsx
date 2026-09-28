"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Bot, Home, Menu, Settings, SlidersHorizontal, X } from "lucide-react";
import type { Theme } from "@/i18n";
import { useI18n } from "@/i18n/client";
import { Favicon } from "./favicon";
import { StatusBadge, type Status } from "./ui-client";
import { SignOutButton } from "./sign-out-button";
import { NavLink } from "./nav-link";
import { LocaleSwitch, ThemeSwitch } from "./prefs";

export type ShellSite = { slug: string; name: string; domain: string; status: Status; pinned: boolean };

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 text-[15px] font-semibold tracking-tight text-foreground">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground" aria-hidden>
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </span>
      Accura Watch
    </Link>
  );
}

function SidebarContent({ sites, userEmail, theme, onNavigate }: { sites: ShellSite[]; userEmail: string; theme: Theme; onNavigate?: () => void }) {
  const { t } = useI18n();
  const nav = [
    { href: "/", label: t.nav.home, icon: Home, exact: true },
    { href: "/sites", label: t.nav.manage, icon: SlidersHorizontal, exact: true },
    { href: "/settings", label: t.nav.settings, icon: Settings, exact: true },
  ];
  return (
    <>
      <nav className="flex flex-col gap-1 px-3">
        {nav.map((n) => (
          <NavLink key={n.href} href={n.href} exact={n.exact} onNavigate={onNavigate}>
            <n.icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
            {n.label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-6 min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        <p className="mb-1.5 px-3 text-xs font-medium text-subtle">{t.nav.sites}</p>
        <ul className="flex flex-col gap-0.5">
          {sites.map((s) => (
            <li key={s.slug}>
              <NavLink href={`/sites/${s.slug}`} dense onNavigate={onNavigate}>
                <Favicon domain={s.domain} size={16} />
                <span className="min-w-0 flex-1 truncate">{s.name}</span>
                <StatusBadge status={s.status} compact />
              </NavLink>
            </li>
          ))}
          {sites.length === 0 ? (
            <li className="px-3 py-1.5 text-sm text-muted-foreground">
              {t.nav.noSites}{" "}
              <Link href="/sites" className="link" onClick={onNavigate}>
                {t.nav.addSites}
              </Link>
            </li>
          ) : null}
        </ul>
      </div>

      <div className="flex flex-col gap-3 border-t border-border px-3 py-3">
        <NavLink href="/settings#agent" onNavigate={onNavigate} dense>
          <Bot className="h-4 w-4" strokeWidth={1.75} />
          {t.nav.agent}
        </NavLink>
        <div className="flex items-center justify-between gap-2 px-1">
          <LocaleSwitch />
          <ThemeSwitch value={theme} />
        </div>
        <div className="flex items-center justify-between gap-2 px-1">
          <span className="min-w-0 truncate text-xs text-subtle" title={userEmail}>
            {userEmail}
          </span>
          <SignOutButton iconOnly />
        </div>
      </div>
    </>
  );
}

export function Shell({
  children,
  userEmail,
  sites,
  theme,
}: {
  children: React.ReactNode;
  userEmail: string;
  sites: ShellSite[];
  theme: Theme;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
  }, [open]);

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <aside
        className="fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-border bg-sidebar lg:flex"
        style={{ width: "var(--sidebar-width)" }}
      >
        <div className="flex h-16 items-center px-6">
          <Logo />
        </div>
        <SidebarContent sites={sites} userEmail={userEmail} theme={theme} />
      </aside>

      {/* Mobile top bar + drawer */}
      <header
        className="sticky z-30 flex h-14 items-center justify-between gap-3 border-b border-border bg-background/90 px-4 backdrop-blur lg:hidden"
        style={{ top: "env(safe-area-inset-top, 0px)" }}
      >
        <Logo />
        <button type="button" className="btn btn-quiet px-2.5" aria-label={t.nav.menu} aria-expanded={open} onClick={() => setOpen(true)}>
          <Menu className="h-5 w-5" />
        </button>
      </header>
      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label={t.nav.menu}>
          <button type="button" className="absolute inset-0 bg-black/40" aria-label={t.common.cancel} onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 right-0 flex w-[min(320px,88vw)] flex-col bg-sidebar pt-[env(safe-area-inset-top,0px)] shadow-[var(--shadow-lg)]">
            <div className="flex h-14 items-center justify-between px-5">
              <Logo />
              <button type="button" className="btn btn-quiet px-2.5" aria-label={t.common.cancel} onClick={() => setOpen(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <SidebarContent sites={sites} userEmail={userEmail} theme={theme} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      ) : null}

      <div className="lg:pl-[var(--sidebar-width)]">
        <main className="mx-auto max-w-[1240px] px-4 pb-16 pt-6 sm:px-6 lg:px-10 lg:pt-10">{children}</main>
      </div>
    </div>
  );
}
