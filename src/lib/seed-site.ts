import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

type SeedSite = {
  name: string;
  slug: string;
  url: string;
  config?: Prisma.InputJsonValue;
};

/** Watched sites V1 - Accura (no Sentry), Brieform + DirectoryFast (Sentry). */
const SEED_SITES: SeedSite[] = [
  {
    name: "Accura",
    slug: "accura",
    url: "https://accura.dev",
  },
  {
    name: "Brieform",
    slug: "brieform",
    url: "https://brieform.app",
    config: { sentryProject: "brieform" },
  },
  {
    name: "DirectoryFast",
    slug: "directoryfast",
    url: "https://directoryfa.st",
    config: { sentryProject: "directoryfast" },
  },
  {
    name: "Watch",
    slug: "watch",
    url: "https://watch.accura.dev",
  },
];

/** Upsert Accura only (compat). Prefer ensureWatchedSites. */
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

/** Upsert all watched sites + Sentry project config where applicable. */
export async function ensureWatchedSites() {
  const out = [];
  for (const s of SEED_SITES) {
    const site = await prisma.site.upsert({
      where: { slug: s.slug },
      create: {
        name: s.name,
        slug: s.slug,
        url: s.url,
        active: true,
        config: s.config ?? undefined,
      },
      update: {
        name: s.name,
        url: s.url,
        active: true,
        ...(s.config !== undefined ? { config: s.config } : {}),
      },
    });
    out.push(site);
  }
  return out;
}
