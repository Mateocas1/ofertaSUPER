import "server-only";

import { classifyPriceFreshness } from "@/lib/price-freshness";
import { db } from "@/lib/db";
import type { BasketProduct } from "@/lib/basket-products-contract";
export { basketProductsBodySchema } from "@/lib/basket-products-contract";

type ProductReader = Pick<typeof db, "product">;

export async function loadBasketProducts(eans: string[], client: ProductReader = db) {
  const rows = await client.product.findMany({
    where: { ean: { in: eans } },
    select: {
      ean: true,
      name: true,
      brand: true,
      image_url: true,
      supermarket_products: {
        where: { price: { not: null } },
        orderBy: [{ supermarket: { slug: "asc" } }, { id: "asc" }],
        select: {
          price: true,
          is_available: true,
          product_url: true,
          last_checked_at: true,
          supermarket: {
            select: { id: true, name: true, slug: true, logo_url: true, freshness_sla_hours: true },
          },
        },
      },
    },
  });

  const byEan = new Map(rows.map((row) => {
    const priceEntries = row.supermarket_products.map((entry) => ({
      supermarket: {
        id: entry.supermarket.id,
        name: entry.supermarket.name,
        slug: entry.supermarket.slug,
        logoUrl: entry.supermarket.logo_url,
      },
      price: entry.price === null ? null : Number(entry.price),
      isAvailable: entry.is_available,
      productUrl: entry.product_url,
      freshnessStatus: classifyPriceFreshness(entry.last_checked_at, {
        maxAgeHours: entry.supermarket.freshness_sla_hours,
      }).status,
    }));
    const availablePrices = priceEntries
      .filter((entry) => entry.isAvailable && entry.price !== null)
      .map((entry) => entry.price as number);
    const freshPrices = priceEntries
      .filter((entry) => entry.isAvailable && entry.freshnessStatus === "fresh" && entry.price !== null)
      .map((entry) => entry.price as number);

    return [row.ean, {
      ean: row.ean,
      name: row.name,
      brand: row.brand,
      imageUrl: row.image_url,
      minPrice: availablePrices.length ? Math.min(...availablePrices) : null,
      freshMinPrice: freshPrices.length ? Math.min(...freshPrices) : null,
      hasFreshPrice: freshPrices.length > 0,
      priceEntries,
    } satisfies BasketProduct] as const;
  }));

  return {
    items: eans.flatMap((ean) => byEan.get(ean) ?? []),
    missing: eans.filter((ean) => !byEan.has(ean)),
  };
}

export async function handleBasketProductsRequest(
  readJson: () => Promise<unknown>,
  loader: typeof loadBasketProducts = loadBasketProducts,
) {
  try {
    const { basketProductsBodySchema } = await import("@/lib/basket-products-contract");
    const { eans } = basketProductsBodySchema.parse(await readJson());
    const result = await loader(eans);
    return { status: 200, body: { ...result, dataSource: "database", degraded: false, latestCheckedAt: null } };
  } catch (error) {
    const { ZodError } = await import("zod");
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return { status: 400, body: { error: "Invalid request body" } };
    }
    return { status: 503, body: { error: "Catalog temporarily unavailable" } };
  }
}
