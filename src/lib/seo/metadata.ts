import type { Metadata } from "next";

import { formatCurrency } from "@/lib/format";
import { normalizeGtin } from "@/lib/identity/gtin";
import type { ProductCatalogPageResult } from "@/lib/seo/public-catalog-page";

export const siteUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://ofertas-super.vercel.app");

type MetadataInput = {
  title: string;
  description: string;
  path?: string;
  /** Atom feeds offered for this page, declared as `<link rel="alternate">`. */
  feeds?: { path: string; title: string }[];
};

export function buildAbsoluteUrl(path = "/") {
  return new URL(path, siteUrl).toString();
}

export function canonicalProductPath(ean: string, productEan?: string | null): string {
  // Every GTIN form (8/12/13/14 digits) of a product resolves to the same page,
  // so the canonical URL must always be the padded GTIN-14 key, never the form
  // the visitor happened to use.
  const canonical = normalizeGtin(productEan) ?? normalizeGtin(ean) ?? ean;
  return `/producto/${canonical}`;
}

export function createUnavailableCatalogMetadata(): Metadata {
  // Empty nested fields replace inherited commercial metadata in Next.js.
  return {
    title: "Catalog temporarily unavailable",
    description: "Catalog information is temporarily unavailable.",
    robots: { index: false, follow: true },
    alternates: {},
    openGraph: {},
    twitter: {},
  };
}

export function createGuardedProductMetadata(page: ProductCatalogPageResult): Metadata {
  if (page.availability === "unavailable") {
    return createUnavailableCatalogMetadata();
  }

  const { product } = page.catalog;
  if (!product) {
    return createMetadata({
      title: "Producto no encontrado",
      description: "El producto solicitado no existe en el catalogo actual.",
      path: canonicalProductPath(page.shell.ean),
    });
  }

  return createMetadata({
    title: `${product.name} desde ${formatCurrency(product.displayPrice)}`,
    description: `Compara ${product.name} en supermercados argentinos y revisa su historial de precio registrado.`,
    path: canonicalProductPath(page.shell.ean, product.ean),
  });
}

export function createMetadata({ title, description, path = "/", feeds = [] }: MetadataInput): Metadata {
  const url = buildAbsoluteUrl(path);

  return {
    metadataBase: siteUrl,
    title,
    description,
    alternates: {
      canonical: url,
      ...(feeds.length > 0
        ? {
          types: {
            "application/atom+xml": feeds.map((feed) => ({
              url: buildAbsoluteUrl(feed.path),
              title: feed.title,
            })),
          },
        }
        : {}),
    },
    openGraph: {
      title,
      description,
      url,
      siteName: "ofertasSUPER",
      locale: "es_AR",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}
