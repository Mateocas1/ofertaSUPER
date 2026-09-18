import "server-only";

import { classifyPriceFreshness } from "@/lib/price-freshness";
import type { BasketProduct } from "@/lib/basket-products-contract";
import {
  createPublicCatalogGuardedRead,
  type PublicCatalogProjection,
} from "@/lib/public-catalog-read.server";
import {
  resolvePublicCatalogDataFromGuardedRead,
  type PublicCatalogGuardedReader,
} from "@/lib/public-catalog-api";
export { basketProductsBodySchema } from "@/lib/basket-products-contract";

type ProductReader = Pick<PublicCatalogProjection, "servingProduct" | "servingOffer" | "servingSupermarket">;

export async function loadBasketProducts(eans: string[], client: ProductReader) {
  const rows = await client.servingProduct.findMany({
    where: { ean: { in: eans } },
    select: { ean: true, name: true, brand: true, image_url: true },
  });
  const offers = await client.servingOffer.findMany({
    where: { product_ean: { in: eans }, price: { not: null } },
    orderBy: [{ supermarket_id: "asc" }],
    select: {
      product_ean: true, supermarket_id: true, price: true, is_available: true,
      product_url: true, last_checked_at: true,
    },
  });
  const supermarkets = await client.servingSupermarket.findMany({
    where: { id: { in: offers.map((offer) => offer.supermarket_id) } },
    select: { id: true, name: true, slug: true, logo_url: true, freshness_sla_hours: true },
  });
  const supermarketsById = new Map(supermarkets.map((supermarket) => [supermarket.id, supermarket]));
  const offersByEan = new Map<string, typeof offers>();
  for (const offer of offers) {
    const grouped = offersByEan.get(offer.product_ean) ?? [];
    grouped.push(offer);
    offersByEan.set(offer.product_ean, grouped);
  }

  const byEan = new Map(rows.map((row) => {
    const priceEntries = (offersByEan.get(row.ean) ?? []).flatMap((entry) => {
      const supermarket = supermarketsById.get(entry.supermarket_id);
      if (!supermarket) return [];
      return [{
        supermarket: {
          id: supermarket.id,
          name: supermarket.name,
          slug: supermarket.slug,
          logoUrl: supermarket.logo_url,
        },
        price: entry.price === null ? null : Number(entry.price),
        isAvailable: entry.is_available,
        productUrl: entry.product_url,
        freshnessStatus: classifyPriceFreshness(entry.last_checked_at, {
          maxAgeHours: supermarket.freshness_sla_hours,
        }).status,
      }];
    }).sort((left, right) => left.supermarket.slug.localeCompare(right.supermarket.slug));
    return [row.ean, {
      ean: row.ean,
      name: row.name,
      brand: row.brand,
      imageUrl: row.image_url,
      minPrice: minimumPrice(priceEntries.filter((entry) => entry.isAvailable)),
      freshMinPrice: minimumPrice(priceEntries.filter((entry) =>
        entry.isAvailable && entry.freshnessStatus === "fresh",
      )),
      hasFreshPrice: priceEntries.some((entry) => entry.isAvailable && entry.freshnessStatus === "fresh" && entry.price !== null),
      priceEntries,
    } satisfies BasketProduct] as const;
  }));

  return {
    items: eans.flatMap((ean) => byEan.get(ean) ?? []),
    missing: eans.filter((ean) => !byEan.has(ean)),
  };
}

function minimumPrice(entries: Array<{ price: number | null }>) {
  const prices = entries.flatMap((entry) => entry.price === null ? [] : [entry.price]);
  return prices.length > 0 ? Math.min(...prices) : null;
}

export async function handleBasketProductsRequest(
  readJson: () => Promise<unknown>,
  loader: typeof loadBasketProducts = loadBasketProducts,
  guardedRead: PublicCatalogGuardedReader = createPublicCatalogGuardedRead(
    process.env.PUBLIC_CATALOG_SERVING_IDENTITY_JSON,
  ),
) {
  try {
    const { basketProductsBodySchema } = await import("@/lib/basket-products-contract");
    const { eans } = basketProductsBodySchema.parse(await readJson());
    const result = await resolvePublicCatalogDataFromGuardedRead(
      (projection) => loader(eans, projection),
      guardedRead,
    );
    return { status: 200, body: {
      ...result,
      degraded: result.degraded || result.items.some((item) => item.priceEntries.some((entry) =>
        entry.price !== null && entry.freshnessStatus !== "fresh",
      )),
    } };
  } catch (error) {
    const { ZodError } = await import("zod");
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return { status: 400, body: { error: "Invalid request body" } };
    }
    return { status: 503, body: { error: "Catalog temporarily unavailable" } };
  }
}
