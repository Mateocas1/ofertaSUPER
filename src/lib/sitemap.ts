import { Prisma } from "@prisma/client";
import type { MetadataRoute } from "next";

import { buildAbsoluteUrl } from "@/lib/seo/metadata";

export type SitemapCatalog = {
  categories: Array<{ slug: string; children: SitemapCatalog["categories"] }>;
  products: Array<{ ean: string; lastCheckedAt: Date | null }>;
};

export function isCatalogDataUnavailable(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientInitializationError
    || error instanceof Prisma.PrismaClientKnownRequestError
    || error instanceof Prisma.PrismaClientRustPanicError
    || error instanceof Prisma.PrismaClientUnknownRequestError;
}

export async function loadOptionalSitemapCatalog(
  loader: () => Promise<SitemapCatalog>,
  unavailable: (error: unknown) => boolean = isCatalogDataUnavailable,
): Promise<SitemapCatalog> {
  try {
    return await loader();
  } catch (error) {
    if (!unavailable(error)) throw error;
    return { categories: [], products: [] };
  }
}

function flattenCategories(categories: SitemapCatalog["categories"]): SitemapCatalog["categories"] {
  return categories.flatMap((category) => [category, ...flattenCategories(category.children)]);
}

export async function buildSitemap(
  loader: () => Promise<SitemapCatalog>,
  now = new Date(),
  unavailable?: (error: unknown) => boolean,
): Promise<MetadataRoute.Sitemap> {
  const { products, categories } = await loadOptionalSitemapCatalog(loader, unavailable);
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: buildAbsoluteUrl("/"), lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: buildAbsoluteUrl("/ofertas"), lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: buildAbsoluteUrl("/buscar"), lastModified: now, changeFrequency: "weekly", priority: 0.6 },
  ];
  const categoryRoutes: MetadataRoute.Sitemap = flattenCategories(categories).map(({ slug }) => ({
    url: buildAbsoluteUrl(`/categoria/${slug}`), lastModified: now, changeFrequency: "weekly", priority: 0.7,
  }));
  const productRoutes: MetadataRoute.Sitemap = products.map(({ ean, lastCheckedAt }) => ({
    url: buildAbsoluteUrl(`/producto/${ean}`), lastModified: lastCheckedAt ?? now, changeFrequency: "daily", priority: 0.8,
  }));
  return [...staticRoutes, ...categoryRoutes, ...productRoutes];
}
