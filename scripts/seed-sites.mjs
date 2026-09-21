/**
 * Seed watched Sites (accura, brieform, directoryfast, watch).
 * Usage: DATABASE_URL=... node scripts/seed-sites.mjs
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SEED = [
  {
    name: "Accura",
    slug: "accura",
    url: "https://accura.dev",
    config: null,
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
    config: null,
  },
];

async function main() {
  for (const s of SEED) {
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
        ...(s.config ? { config: s.config } : {}),
      },
    });
    console.log(
      "Seeded:",
      site.slug,
      site.id,
      s.config?.sentryProject ? `sentry=${s.config.sentryProject}` : "no-sentry",
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
