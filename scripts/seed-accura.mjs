/**
 * Seed Site { name: Accura, slug: accura, url: https://accura.dev }
 * Usage: DATABASE_URL=... node scripts/seed-accura.mjs
 * (requires prisma generate after schema push)
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const site = await prisma.site.upsert({
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
  console.log("Seeded site:", site.slug, site.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
