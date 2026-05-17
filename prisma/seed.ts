import "../scripts/load-env";

import { PrismaClient } from "@prisma/client";

import { SUPERMARKETS } from "../src/lib/supermarkets";

const prisma = new PrismaClient();

async function main() {
  for (const supermarket of SUPERMARKETS) {
    await prisma.supermarket.upsert({
      where: { slug: supermarket.slug },
      update: {
        name: supermarket.name,
        logo_url: supermarket.logoUrl,
        base_url: supermarket.baseUrl,
        is_vtex: true,
      },
      create: {
        name: supermarket.name,
        slug: supermarket.slug,
        logo_url: supermarket.logoUrl,
        base_url: supermarket.baseUrl,
        is_vtex: true,
      },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error("Seed failed", error);
    await prisma.$disconnect();
    process.exit(1);
  });