import { getCategories } from "@/lib/catalog";
import { db } from "@/lib/db";
import { buildSitemap, type SitemapCatalog } from "@/lib/sitemap";

export const revalidate = 21600;
export const dynamic = "force-dynamic";

async function loadSitemapCatalog(): Promise<SitemapCatalog> {
  const [products, categories] = await Promise.all([
    db.product.findMany({
      select: {
        ean: true,
        supermarket_products: {
          orderBy: {
            last_checked_at: "desc",
          },
          take: 1,
          select: {
            last_checked_at: true,
          },
        },
      },
    }),
    getCategories(),
  ]);

  return {
    categories,
    products: products.map((product) => ({
      ean: product.ean,
      lastCheckedAt: product.supermarket_products[0]?.last_checked_at ?? null,
    })),
  };
}

export default function sitemap() {
  return buildSitemap(loadSitemapCatalog);
}
