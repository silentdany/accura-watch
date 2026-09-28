import { Shell } from "@/components/shell";
import { requireSession } from "@/lib/require-session";
import { prisma } from "@/lib/prisma";
import { getTheme } from "@/i18n/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [session, theme] = await Promise.all([requireSession(), getTheme()]);
  const sites = await prisma.site.findMany({
    where: { active: true },
    orderBy: [{ pinned: "desc" }, { name: "asc" }],
    include: { healthChecks: { orderBy: { checkedAt: "desc" }, take: 1, select: { ok: true } } },
  });
  return (
    <Shell
      theme={theme}
      userEmail={session.user.email}
      sites={sites.map((s) => ({
        slug: s.slug,
        name: s.name,
        domain: s.domain,
        pinned: s.pinned,
        status: s.healthChecks[0] ? (s.healthChecks[0].ok ? "up" : "down") : "unknown",
      }))}
    >
      {children}
    </Shell>
  );
}
