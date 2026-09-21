import type { MetadataRoute } from "next";

import { buildAbsoluteUrl } from "@/lib/seo/metadata";

export type SitemapCategory = { slug: string; children?: SitemapCategory[] };
export type SitemapCatalog = {
  products: Array<{ ean: string }>;
};

export async function loadOptionalSitemapCatalog(
  loader: () => Promise<SitemapCatalog>,
  unavailable: (error: unknown) => boolean,
): Promise<SitemapCatalog | null> {
  try {
    return await loader();
  } catch (error) {
    if (!unavailable(error)) throw error;
    return null;
  }
}

function flattenCategories(categories: SitemapCategory[]): SitemapCategory[] {
  return categories.flatMap((category) => [category, ...flattenCategories(category.children ?? [])]);
}

export async function buildSitemap(
  loader: () => Promise<SitemapCatalog>,
  categories: SitemapCategory[],
  unavailable: (error: unknown) => boolean,
): Promise<MetadataRoute.Sitemap> {
  const catalog = await loadOptionalSitemapCatalog(loader, unavailable);
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: buildAbsoluteUrl("/"), changeFrequency: "daily", priority: 1 },
    { url: buildAbsoluteUrl("/ofertas"), changeFrequency: "daily", priority: 0.9 },
    { url: buildAbsoluteUrl("/buscar"), changeFrequency: "weekly", priority: 0.6 },
  ];
  const categoryRoutes: MetadataRoute.Sitemap = flattenCategories(categories).map(({ slug }) => ({
    url: buildAbsoluteUrl(`/categoria/${slug}`), changeFrequency: "weekly", priority: 0.7,
  }));
  const productRoutes: MetadataRoute.Sitemap = (catalog?.products ?? []).map(({ ean }) => ({
    url: buildAbsoluteUrl(`/producto/${ean}`), changeFrequency: "daily", priority: 0.8,
  }));
  return [...staticRoutes, ...categoryRoutes, ...productRoutes];
}
