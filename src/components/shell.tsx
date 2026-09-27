import Link from "next/link";
import { Bot, Globe, LayoutDashboard, Settings } from "lucide-react";
import { Favicon, StatusDot, type Status } from "./ui";
import { SignOutButton } from "./sign-out-button";
import { NavLink } from "./nav-link";

export type ShellSite = { slug: string; name: string; domain: string; status: Status; pinned: boolean };

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight text-foreground">
      <span className="relative flex h-5 w-5 items-center justify-center rounded-md bg-primary/15 ring-1 ring-primary/40">
        <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_10px_hsl(158_70%_55%/0.9)]" />
      </span>
      Accura Watch
    </Link>
  );
}

const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/sites", label: "Sites", icon: Globe },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Shell({ children, userEmail, sites }: { children: React.ReactNode; userEmail: string; sites: ShellSite[] }) {
  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <aside
        className="fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-border bg-sidebar lg:flex"
        style={{ width: "var(--sidebar-width)" }}
      >
        <div className="flex h-14 items-center px-4">
          <Logo />
        </div>
        <nav className="flex flex-col gap-0.5 px-2">
          {NAV.map((n) => (
            <NavLink key={n.href} href={n.href} exact={n.exact}>
              <n.icon className="h-4 w-4" strokeWidth={1.75} />
              {n.label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-5 min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          <p className="eyebrow mb-1.5 px-2.5">Sites · {sites.length}</p>
          <ul className="flex flex-col gap-px">
            {sites.map((s) => (
              <li key={s.slug}>
                <NavLink href={`/sites/${s.slug}`} dense>
                  <Favicon domain={s.domain} size={14} />
                  <span className="min-w-0 flex-1 truncate">{s.name}</span>
                  <StatusDot status={s.status} />
                </NavLink>
              </li>
            ))}
            {sites.length === 0 ? (
              <li className="px-2.5 py-1.5 text-xs text-subtle">
                No sites yet —{" "}
                <Link href="/sites" className="text-primary hover:underline">
                  add or import
                </Link>
              </li>
            ) : null}
          </ul>
        </div>

        <div className="border-t border-border p-2">
          <NavLink href="/settings#mcp">
            <Bot className="h-4 w-4" strokeWidth={1.75} />
            Connect an AI agent
          </NavLink>
          <p className="truncate px-2.5 pt-2 text-[11px] text-subtle" title={userEmail}>
            {userEmail}
          </p>
          <SignOutButton />
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-12 items-center justify-between gap-3 border-b border-border bg-sidebar/95 px-4 backdrop-blur lg:hidden">
        <Logo />
        <nav className="flex items-center gap-1">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={n.label}>
              <n.icon className="h-4 w-4" strokeWidth={1.75} />
            </Link>
          ))}
        </nav>
      </header>

      <div className="lg:pl-[var(--sidebar-width)]">
        <main className="mx-auto max-w-[1480px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
