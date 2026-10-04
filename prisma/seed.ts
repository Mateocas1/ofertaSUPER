import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CMVP_SUPERMARKETS = [
  { name: "Disco", slug: "disco", logo_url: "https://logo.clearbit.com/disco.com.ar", base_url: "https://www.disco.com.ar" },
  { name: "Jumbo", slug: "jumbo", logo_url: "https://logo.clearbit.com/jumbo.com.ar", base_url: "https://www.jumbo.com.ar" },
  { name: "Carrefour", slug: "carrefour", logo_url: "https://logo.clearbit.com/carrefour.com.ar", base_url: "https://www.carrefour.com.ar" },
  { name: "Vea", slug: "vea", logo_url: "https://logo.clearbit.com/vea.com.ar", base_url: "https://www.vea.com.ar" },
  { name: "Coto", slug: "coto", logo_url: "https://logo.clearbit.com/coto.com.ar", base_url: "https://www.coto.com.ar" },
] as const;

async function main() {
  for (const supermarket of CMVP_SUPERMARKETS) {
    const is_vtex = supermarket.slug !== "coto";
    await prisma.supermarket.upsert({
      where: { slug: supermarket.slug },
      update: { ...supermarket, is_vtex },
      create: { ...supermarket, is_vtex },
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
