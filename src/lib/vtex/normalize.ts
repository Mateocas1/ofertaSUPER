import { normalizeGtin } from "../identity/gtin";
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

  for (const candidate of candidates) {
    const normalized = normalizeGtin(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function pickSellerAndOffer(rawProduct: LooseRecord, sku: LooseRecord | undefined) {
  const skuSellers = asRecordArray(sku?.sellers);
  const sellers = skuSellers.length > 0 ? skuSellers : asRecordArray(rawProduct.sellers);
  const seller = sellers.find((entry) => asRecord(entry.commertialOffer)?.AvailableQuantity) ?? sellers[0];

  return { seller, offer: asRecord(seller?.commertialOffer) ?? asRecord(seller?.commercialOffer) };
}

function pickOfferPrices(rawProduct: LooseRecord, offer: LooseRecord | null) {
  const price = asNumber(offer?.Price ?? rawProduct.price);

  return {
    price,
    listPrice: normalizeListPrice(price, asNumber(offer?.ListPrice ?? rawProduct.listPrice)),
  };
}

// An absent availability signal must not become "available". Treating an
// unobserved offer as purchasable puts it in comparisons and in the basket,
// so only an explicit signal from the source can mark an offer eligible.
function resolveAvailability(offer: LooseRecord | null, rawProduct: LooseRecord): boolean {
  const signals = [offer?.AvailableQuantity, offer?.IsAvailable, rawProduct.available];

  for (const signal of signals) {
    if (signal !== undefined && signal !== null) {
      return Boolean(signal);
    }
  }

  return false;
}

function pickOffer(rawProduct: LooseRecord, sku: LooseRecord | undefined) {
  const { seller, offer } = pickSellerAndOffer(rawProduct, sku);
  const { price, listPrice } = pickOfferPrices(rawProduct, offer);

  return {
    sellerId: pickFirstString(seller?.sellerId, seller?.id),
    price,
    listPrice,
    referencePrice: asNumber(rawProduct.unitMultiplier ?? offer?.PriceWithoutDiscount),
    referenceUnit: pickFirstString(rawProduct.measurementUnit, sku?.measurementUnit),
    isAvailable: resolveAvailability(offer, rawProduct),
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