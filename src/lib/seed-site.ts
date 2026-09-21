import { prisma } from "@/lib/prisma";

/** Upsert the Accura seed site (slug: accura). */
export async function ensureAccuraSite() {
  return prisma.site.upsert({
    where: { slug: "accura" },
    create: {
      name: "Accura",
      slug: "accura",
      url: "https://accura.dev",
      active: true,
    },
    update: {
      name: "Accura",
      url: "https://accura.dev",
      active: true,
    },
  });
}
