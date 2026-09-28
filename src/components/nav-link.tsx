"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({
  href,
  exact = false,
  dense = false,
  onNavigate,
  children,
}: {
  href: string;
  exact?: boolean;
  dense?: boolean;
  onNavigate?: () => void;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const path = href.split("#")[0];
  const active = exact ? pathname === path : pathname === path || pathname.startsWith(`${path}/`);
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3 rounded-lg px-3 ${dense ? "py-1.5 text-sm" : "py-2 text-[15px]"} transition-colors ${
        active
          ? "bg-card font-medium text-foreground shadow-[var(--shadow)] ring-1 ring-border"
          : "text-muted-foreground hover:bg-card/70 hover:text-foreground"
      }`}
    >
      {children}
    </Link>
  );
}
