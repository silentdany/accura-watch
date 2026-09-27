import { Shell } from "@/components/shell";
import { requireSession } from "@/lib/require-session";
import { prisma } from "@/lib/prisma";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const sites = await prisma.site.findMany({
    where: { active: true },
    orderBy: [{ pinned: "desc" }, { name: "asc" }],
    include: { healthChecks: { orderBy: { checkedAt: "desc" }, take: 1, select: { ok: true } } },
  });
  return (
    <Shell
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
