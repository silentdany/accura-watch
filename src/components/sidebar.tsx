import Link from "next/link";

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/#health", label: "Health" },
  { href: "/#sentry", label: "Sentry" },
  { href: "/#posthog", label: "PostHog" },
  { href: "/#gsc", label: "GSC" },
  { href: "/#ahrefs", label: "Ahrefs" },
  { href: "/login", label: "Login" },
];

export function Sidebar() {
  return (
    <aside
      className="fixed inset-y-0 left-0 z-30 flex w-[240px] flex-col border-r border-border bg-sidebar"
      style={{ width: "var(--sidebar-width)" }}
    >
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <span
          className="inline-block h-2.5 w-2.5 rounded-full bg-primary shadow-[0_0_12px_hsl(158_70%_55%/0.7)]"
          aria-hidden
        />
        <Link href="/" className="font-semibold tracking-tight text-foreground">
          Accura Watch
        </Link>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 p-3 text-sm">
        {NAV.map((item) => (
          <Link
            key={item.href + item.label}
            href={item.href}
            className="rounded-md px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="border-t border-border p-3 text-[11px] text-muted-foreground">
        V1 scaffold · Console graphite
      </div>
    </aside>
  );
}
