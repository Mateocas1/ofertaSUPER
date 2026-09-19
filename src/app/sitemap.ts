import {
  PublicCatalogUnavailableError,
  resolvePublicCatalogDataFromGuardedRead,
} from "@/lib/public-catalog-api";
import { createPublicCatalogGuardedRead } from "@/lib/public-catalog-read.server";
import { buildSitemap, type SitemapCatalog } from "@/lib/sitemap";
import { DETAILED_CATEGORIES } from "@/lib/vtex/categories";

export const dynamic = "force-dynamic";

async function loadSitemapCatalog(): Promise<SitemapCatalog> {
  const catalog = await resolvePublicCatalogDataFromGuardedRead(
    (projection) => projection.servingProduct.findMany({
      select: { ean: true },
      orderBy: { ean: "asc" },
    }),
    createPublicCatalogGuardedRead(process.env.PUBLIC_CATALOG_SERVING_IDENTITY_JSON),
  );

  return { products: catalog.map(({ ean }) => ({ ean })) };
}

export default function sitemap() {
  return buildSitemap(
    loadSitemapCatalog,
    DETAILED_CATEGORIES.map(({ slug }) => ({ slug })),
    (error) => error instanceof PublicCatalogUnavailableError,
  );
}
