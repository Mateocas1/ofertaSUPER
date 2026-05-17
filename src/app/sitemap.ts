import type { MetadataRoute } from "next";

import { getCategories } from "@/lib/catalog";
import { db } from "@/lib/db";
import { buildAbsoluteUrl } from "@/lib/seo/metadata";

export const revalidate = 21600;

type CategoryNode = Awaited<ReturnType<typeof getCategories>>[number];

function flattenCategories(categories: CategoryNode[]): CategoryNode[] {
  return categories.flatMap((category) => [category, ...flattenCategories(category.children)]);
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
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

  const now = new Date();
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: buildAbsoluteUrl("/"),
      lastModified: now,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: buildAbsoluteUrl("/ofertas"),
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: buildAbsoluteUrl("/buscar"),
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.6,
    },
  ];

  const categoryRoutes: MetadataRoute.Sitemap = flattenCategories(categories).map((category) => ({
    url: buildAbsoluteUrl(`/categoria/${category.slug}`),
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  const productRoutes: MetadataRoute.Sitemap = products.map((product) => ({
    url: buildAbsoluteUrl(`/producto/${product.ean}`),
    lastModified: product.supermarket_products[0]?.last_checked_at ?? now,
    changeFrequency: "daily",
    priority: 0.8,
  }));

  return [...staticRoutes, ...categoryRoutes, ...productRoutes];
}