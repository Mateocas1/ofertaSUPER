import type { ProductDetail } from "@/lib/catalog";
import { buildAbsoluteUrl } from "@/lib/seo/metadata";

type JsonLdNode = Record<string, unknown>;

type BreadcrumbItem = {
  name: string;
  path: string;
};

function sanitizeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function toSchemaPrice(value: number) {
  return value.toFixed(2);
}

function buildBreadcrumbSchema(items: BreadcrumbItem[]): JsonLdNode {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: buildAbsoluteUrl(item.path),
    })),
  };
}

function buildOfferSchema(
  product: ProductDetail,
  entry: ProductDetail["priceEntries"][number],
): JsonLdNode | null {
  const resolvedPrice = entry.finalPrice ?? entry.price;

  if (resolvedPrice === null) {
    return null;
  }

  const hasSpecialPricing =
    entry.finalPrice !== null || entry.bestPromotion !== null || entry.automaticDiscountPercent !== null;
  const pageUrl = buildAbsoluteUrl(`/producto/${product.ean}`);
  const priceValidUntil = entry.bestPromotion?.endDate ?? undefined;
  const description = entry.bestPromotion
    ? entry.bestPromotion.title
    : entry.automaticDiscountPercent !== null
      ? `${entry.automaticDiscountPercent.toFixed(0)}% OFF detectado sobre list price`
      : undefined;

  return {
    "@type": hasSpecialPricing ? "SpecialOffer" : "Offer",
    "@id": `${pageUrl}#offer-${entry.supermarket.slug}`,
    url: entry.productUrl ?? pageUrl,
    price: toSchemaPrice(resolvedPrice),
    priceCurrency: "ARS",
    availability: entry.isAvailable ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    itemCondition: "https://schema.org/NewCondition",
    seller: {
      "@type": "Organization",
      name: entry.supermarket.name,
    },
    ...(priceValidUntil ? { priceValidUntil } : {}),
    ...(description ? { description } : {}),
  };
}

export function buildProductPageSchema(product: ProductDetail): JsonLdNode {
  const pageUrl = buildAbsoluteUrl(`/producto/${product.ean}`);
  const breadcrumbItems: BreadcrumbItem[] = [{ name: "Inicio", path: "/" }];

  if (product.category) {
    const categorySlug = product.category
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

    breadcrumbItems.push({
      name: product.category,
      path: `/categoria/${categorySlug}`,
    });
  }

  breadcrumbItems.push({
    name: product.name,
    path: `/producto/${product.ean}`,
  });

  const offers = product.priceEntries
    .map((entry) => buildOfferSchema(product, entry))
    .filter((entry): entry is JsonLdNode => entry !== null);
  const graph: JsonLdNode[] = [
    buildBreadcrumbSchema(breadcrumbItems),
    {
      "@type": "Product",
      "@id": `${pageUrl}#product`,
      name: product.name,
      description: product.description ?? `Comparativa de ${product.name} en supermercados argentinos.`,
      sku: product.ean,
      ...(product.ean.length === 13 ? { gtin13: product.ean } : {}),
      image:
        product.images.length > 0
          ? product.images
          : product.imageUrl
            ? [product.imageUrl]
            : undefined,
      ...(product.brand
        ? {
            brand: {
              "@type": "Brand",
              name: product.brand,
            },
          }
        : {}),
      ...(offers.length > 0 ? { offers } : {}),
    },
  ];

  return {
    "@context": "https://schema.org",
    "@graph": graph,
  };
}

export function serializeJsonLd(value: JsonLdNode) {
  return sanitizeJsonLd(value);
}