import {
  PublicCatalogUnavailableError,
} from "@/lib/public-catalog-api";
import { loadSnapshotSitemapCatalog } from "@/lib/public-pages";
import { buildSitemap, type SitemapCatalog } from "@/lib/sitemap";
import { DETAILED_CATEGORIES } from "@/lib/vtex/categories";

// No route segment config: the snapshot ships with the deployment, so the
// sitemap is generated once at build time and served as a static file.
export default function sitemap() {
  return buildSitemap(
    loadSnapshotSitemapCatalog as () => Promise<SitemapCatalog>,
    DETAILED_CATEGORIES.map(({ slug }) => ({ slug })),
    (error) => error instanceof PublicCatalogUnavailableError,
  );
}
