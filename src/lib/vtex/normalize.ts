import { inferCategoryFromText } from "./categories";

type LooseRecord = Record<string, unknown>;

export type NormalizedProduct = {
  ean: string;
  name: string;
  brand: string | null;
  description: string | null;
  imageUrl: string | null;
  images: string[];
  category: string | null;
  skuId: string | null;
  sellerId: string | null;
  productUrl: string | null;
  price: number | null;
  listPrice: number | null;
  referencePrice: number | null;
  referenceUnit: string | null;
  isAvailable: boolean;
};

function stripHtml(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const numeric = Number(value.replace(",", "."));
    return Number.isFinite(numeric) ? numeric : null;
  }

  return null;
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isEan(value: string | null) {
  return Boolean(value && /^\d{8,14}$/.test(value));
}

function pickFirstString(...values: unknown[]) {
  for (const value of values) {
    const parsed = asString(value);
    if (parsed) {
      return parsed;
    }
  }

  return null;
}

function asRecord(value: unknown): LooseRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as LooseRecord) : null;
}

function asRecordArray(value: unknown) {
  return Array.isArray(value) ? value.map((entry) => asRecord(entry)).filter((entry): entry is LooseRecord => Boolean(entry)) : [];
}

function normalizeCategoryValue(value: string | null) {
  if (!value) {
    return null;
  }

  if (!value.includes("/")) {
    return value;
  }

  const parts = value.split("/").map((entry) => entry.trim()).filter(Boolean);
  return parts.at(-1) ?? null;
}

function normalizeListPrice(price: number | null, listPrice: number | null) {
  if (price === null || listPrice === null) {
    return listPrice;
  }

  if (listPrice < price || listPrice > price * 5) {
    return null;
  }

  return listPrice;
}

function pickImages(rawProduct: LooseRecord, sku: LooseRecord | undefined, baseUrl: string) {
  const rawImages = [
    ...asRecordArray(rawProduct.items).flatMap((item) => asRecordArray(item.images)),
    ...asRecordArray(sku?.images),
    ...asRecordArray(rawProduct.images),
  ];

  const images = rawImages
    .map((entry) => pickFirstString(entry.imageUrl, entry.imageLabel, entry.imageText))
    .filter((entry): entry is string => Boolean(entry))
    .map((entry) => (entry.startsWith("http") ? entry : new URL(entry, baseUrl).toString()));

  return Array.from(new Set(images));
}

function pickEan(rawProduct: LooseRecord, sku: LooseRecord | undefined) {
  const referenceIds = [
    ...asRecordArray(rawProduct.referenceId),
    ...asRecordArray(sku?.referenceId),
  ];

  const candidates = [
    rawProduct.ean,
    rawProduct.EAN,
    sku?.ean,
    sku?.EAN,
    ...referenceIds.map((entry) => entry.Value ?? entry.value),
  ].map((value) => asString(value));

  return candidates.find((value) => isEan(value)) ?? null;
}

function pickOffer(rawProduct: LooseRecord, sku: LooseRecord | undefined) {
  const sellers = asRecordArray(sku?.sellers).length > 0 ? asRecordArray(sku?.sellers) : asRecordArray(rawProduct.sellers);
  const seller = sellers.find((entry) => asRecord(entry.commertialOffer)?.AvailableQuantity) ?? sellers[0];
  const offer = asRecord(seller?.commertialOffer) ?? asRecord(seller?.commercialOffer);
  const price = asNumber(offer?.Price ?? rawProduct.price);
  const listPrice = asNumber(offer?.ListPrice ?? rawProduct.listPrice);

  return {
    sellerId: pickFirstString(seller?.sellerId, seller?.id),
    price,
    listPrice: normalizeListPrice(price, listPrice),
    referencePrice: asNumber(rawProduct.unitMultiplier ?? offer?.PriceWithoutDiscount),
    referenceUnit: pickFirstString(rawProduct.measurementUnit, sku?.measurementUnit),
    isAvailable: Boolean(offer?.AvailableQuantity ?? offer?.IsAvailable ?? rawProduct.available ?? true),
  };
}

function pickProductUrl(rawProduct: LooseRecord, baseUrl: string) {
  const rawPath = pickFirstString(rawProduct.linkText && `/${rawProduct.linkText}/p`, rawProduct.link);
  if (!rawPath) {
    return null;
  }

  return rawPath.startsWith("http") ? rawPath : new URL(rawPath, baseUrl).toString();
}

export function normalizeProduct(rawProduct: LooseRecord, baseUrl: string): NormalizedProduct | null {
  const sku = asRecordArray(rawProduct.items)[0];
  const ean = pickEan(rawProduct, sku);

  if (!ean) {
    return null;
  }

  const images = pickImages(rawProduct, sku, baseUrl);
  const offer = pickOffer(rawProduct, sku);
  const name = stripHtml(pickFirstString(rawProduct.productName, rawProduct.name));

  if (!name) {
    return null;
  }

  const description = stripHtml(pickFirstString(rawProduct.description, rawProduct.metaTagDescription));
  const brand = stripHtml(pickFirstString(rawProduct.brand, rawProduct.brandName));
  const category = stripHtml(
    pickFirstString(
      inferCategoryFromText(name),
      asRecordArray(rawProduct.categoryTree)[0]?.name,
      normalizeCategoryValue(
        Array.isArray(rawProduct.categories) ? asString(rawProduct.categories[0]) : asString(rawProduct.category),
      ),
    ),
  );

  return {
    ean,
    name,
    brand,
    description,
    imageUrl: images[0] ?? null,
    images,
    category,
    skuId: pickFirstString(sku?.itemId, sku?.id),
    sellerId: offer.sellerId,
    productUrl: pickProductUrl(rawProduct, baseUrl),
    price: offer.price,
    listPrice: offer.listPrice,
    referencePrice: offer.referencePrice,
    referenceUnit: offer.referenceUnit,
    isAvailable: offer.isAvailable,
  };
}