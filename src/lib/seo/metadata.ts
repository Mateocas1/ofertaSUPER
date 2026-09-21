import type { Metadata } from "next";

import { formatCurrency } from "@/lib/format";
import type { ProductCatalogPageResult } from "@/lib/seo/public-catalog-page";

export const siteUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://ofertas-super.vercel.app");

type MetadataInput = {
  title: string;
  description: string;
  path?: string;
};

export function buildAbsoluteUrl(path = "/") {
  return new URL(path, siteUrl).toString();
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
      path: `/producto/${page.shell.ean}`,
    });
  }

  return createMetadata({
    title: `${product.name} desde ${formatCurrency(product.displayPrice)}`,
    description: `Compara ${product.name} en supermercados argentinos y revisa su historial de precio registrado.`,
    path: `/producto/${page.shell.ean}`,
  });
}

export function createMetadata({ title, description, path = "/" }: MetadataInput): Metadata {
  const url = buildAbsoluteUrl(path);

  return {
    metadataBase: siteUrl,
    title,
    description,
    alternates: {
      canonical: url,
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
