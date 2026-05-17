export type SupermarketDefinition = {
  name: string;
  slug: string;
  logoUrl: string;
  baseUrl: string;
  adapter: "vtex";
};

export const SUPERMARKETS: SupermarketDefinition[] = [
  {
    name: "Disco",
    slug: "disco",
    logoUrl: "https://logo.clearbit.com/disco.com.ar",
    baseUrl: "https://www.disco.com.ar",
    adapter: "vtex",
  },
  {
    name: "Jumbo",
    slug: "jumbo",
    logoUrl: "https://logo.clearbit.com/jumbo.com.ar",
    baseUrl: "https://www.jumbo.com.ar",
    adapter: "vtex",
  },
  {
    name: "Vea",
    slug: "vea",
    logoUrl: "https://logo.clearbit.com/vea.com.ar",
    baseUrl: "https://www.vea.com.ar",
    adapter: "vtex",
  },
  {
    name: "Carrefour",
    slug: "carrefour",
    logoUrl: "https://logo.clearbit.com/carrefour.com.ar",
    baseUrl: "https://www.carrefour.com.ar",
    adapter: "vtex",
  },
  {
    name: "DIA Online",
    slug: "dia",
    logoUrl: "https://logo.clearbit.com/diaonline.com.ar",
    baseUrl: "https://diaonline.supermercadosdia.com.ar",
    adapter: "vtex",
  },
  {
    name: "MAS Online",
    slug: "mas",
    logoUrl: "https://logo.clearbit.com/masonline.com.ar",
    baseUrl: "https://www.masonline.com.ar",
    adapter: "vtex",
  },
];

export function listVtexSupermarkets() {
  return SUPERMARKETS.filter((entry) => entry.adapter === "vtex");
}

export function getSupermarketBySlug(slug: string) {
  const supermarket = SUPERMARKETS.find((entry) => entry.slug === slug);

  if (!supermarket) {
    throw new Error(`Unknown supermarket slug: ${slug}`);
  }

  return supermarket;
}