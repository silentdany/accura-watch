"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({
  href,
  exact = false,
  dense = false,
  children,
}: {
  href: string;
  exact?: boolean;
  dense?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const path = href.split("#")[0];
  const active = exact ? pathname === path : pathname === path || pathname.startsWith(`${path}/`);
  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 rounded-md px-2.5 ${dense ? "py-1.5 text-[13px]" : "py-2 text-sm"} transition-colors ${
        active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      }`}
    >
      {children}
    </Link>
  );
}
