import {
  PublicCatalogUnavailableError,
} from "@/lib/public-catalog-api";
import { loadSnapshotSitemapCatalog } from "@/lib/public-pages";
import { buildSitemap, type SitemapCatalog } from "@/lib/sitemap";
import { DETAILED_CATEGORIES } from "@/lib/vtex/categories";

export const dynamic = "force-dynamic";

export default function sitemap() {
  return buildSitemap(
    loadSnapshotSitemapCatalog as () => Promise<SitemapCatalog>,
    DETAILED_CATEGORIES.map(({ slug }) => ({ slug })),
    (error) => error instanceof PublicCatalogUnavailableError,
  );
}
