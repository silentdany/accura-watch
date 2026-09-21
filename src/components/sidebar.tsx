import Link from "next/link";
import type { SiteStatus } from "@/lib/sites";
import { SignOutButton } from "./sign-out-button";

const statusDot: Record<SiteStatus, string> = {
  up: "bg-primary shadow-[0_0_10px_hsl(158_70%_55%/0.55)]",
  degraded: "bg-warning",
  down: "bg-destructive",
  unknown: "bg-muted-foreground",
};

export type SidebarSite = {
  slug: string;
  name: string;
  status: SiteStatus;
};

export function Sidebar({
  userEmail,
  sites,
}: {
  userEmail: string;
  sites: SidebarSite[];
}) {
  return (
    <aside
      className="fixed inset-y-0 left-0 z-30 flex flex-col border-r border-border bg-sidebar"
      style={{ width: "var(--sidebar-width)" }}
    >
      <div className="flex h-12 items-center gap-2 border-b border-border px-4">
        <span
          className="inline-block h-2.5 w-2.5 rounded-full bg-primary shadow-[0_0_12px_hsl(158_70%_55%/0.7)]"
          aria-hidden
        />
        <Link href="/" className="font-semibold tracking-tight text-foreground">
          Accura Watch
        </Link>
      </div>

      <div className="px-3 pt-4">
        <p className="mb-2 px-2 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Sites
        </p>
        <ul className="flex flex-col gap-0.5">
          {sites.map((site) => (
            <li key={site.slug}>
              <Link
                href={`/#site-${site.slug}`}
                className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDot[site.status]}`}
                  aria-hidden
                />
                <span className="truncate">{site.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <nav className="mt-4 flex flex-1 flex-col gap-0.5 border-t border-border p-3 text-sm">
        <Link
          href="/"
          className="rounded-md px-3 py-2 text-foreground transition-colors hover:bg-muted"
        >
          Overview
        </Link>
      </nav>

      <div className="border-t border-border p-3">
        <p
          className="truncate px-3 text-[11px] text-muted-foreground"
          title={userEmail}
        >
          {userEmail}
        </p>
        <SignOutButton />
      </div>
    </aside>
  );
}
