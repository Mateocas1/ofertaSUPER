import axios from "axios";

import { normalizeGtin } from "../identity/gtin";
import { parseSimplePromotion, type SimplePromotion } from "../promotions/simple-promos";
import { inferCategoryFromText } from "../vtex/categories";
import type { NormalizedProduct } from "../vtex/normalize";

// Coto (#568) is not a VTEX store. Its site (www.coto.com.ar, an Angular app)
// searches and browses through Constructor.io with the public client key the
// site itself sends from every browser. Each result carries the shelf price of
// every branch; the site prices for branch 200 unless the shopper picks
// another, so the refresh does the same (COTO_STORE_ID overrides it).
//
// Field mapping, read live on 2026-10-04:
//   product_main_ean            -> ean (GTIN-14 like every other source)
//   price[store].listPrice      -> price ("Precio Contado", the shelf price)
//   price[store].formatPrice    -> referencePrice per product_format ("Kilo", "Litro"...)
//   discounts[].discountText    -> promo ("25%Dto" -> percent-off)
//   store_availability          -> isAvailable for the branch
//   groups[0].path_list[1]      -> category (department), unless the name implies one

export const COTO_BASE_URL = "https://www.coto.com.ar";
const CONSTRUCTOR_URL = "https://ac.cnstrc.com";
const CONSTRUCTOR_KEY = "key_r6xzz4IAoTWcipni";
const DEFAULT_STORE_ID = "200";
export const COTO_PAGE_SIZE = 200;
const GROUP_ID_PATTERN = /^catv(\d{8})$/;

type LooseRecord = Record<string, unknown>;

export type CotoHttpClient = { get: (url: string) => Promise<{ data: unknown }> };

export type CotoClientDependencies = {
  http?: CotoHttpClient;
  sleep?: (ms: number) => Promise<void>;
  storeId?: string;
};

export type CotoProduct = { product: NormalizedProduct; promo: SimplePromotion | null };

export type CotoProductsResult = NormalizedProduct[] & {
  promoByEan?: Map<string, SimplePromotion | null>;
  pagesFailed?: number;
};

const http = axios.create({
  timeout: 20_000,
  headers: {
    accept: "application/json",
    "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    origin: COTO_BASE_URL,
    referer: `${COTO_BASE_URL}/`,
  },
});

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function requestDelayMs() {
  const min = Number(process.env.COTO_REQUEST_MIN_DELAY_MS ?? 400);
  const max = Number(process.env.COTO_REQUEST_MAX_DELAY_MS ?? 900);
  const lower = Number.isFinite(min) && min >= 0 ? min : 400;
  const upper = Number.isFinite(max) && max >= lower ? max : lower;
  return lower + Math.floor(Math.random() * (upper - lower + 1));
}

function storeIdOf(dependencies: CotoClientDependencies) {
  return dependencies.storeId ?? process.env.COTO_STORE_ID ?? DEFAULT_STORE_ID;
}

function isRecord(value: unknown): value is LooseRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function records(value: unknown): LooseRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function asNumber(value: unknown): number | null {
  const numeric = typeof value === "string" ? Number(value.replace(/[$\s]/g, "")) : value;
  return typeof numeric === "number" && Number.isFinite(numeric) ? numeric : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

// Coto's group ids are `catv` + 8 digits; the refresh plan keeps numeric
// category ids (/<department>/<category>/), so the two convert both ways.
export function cotoGroupIdFromNumber(id: number) {
  return `catv${String(id).padStart(8, "0")}`;
}

export function cotoNumberFromGroupId(groupId: string): number | null {
  const match = GROUP_ID_PATTERN.exec(groupId);
  return match ? Number(match[1]) : null;
}

function constructorUrl(path: string, params: Record<string, string | number>) {
  const url = new URL(path, CONSTRUCTOR_URL);
  url.searchParams.set("key", CONSTRUCTOR_KEY);
  url.searchParams.set("c", "ciojs-client-2.66.0");
  url.searchParams.set("i", "ofertasuper-refresh");
  url.searchParams.set("s", "1");
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  return url.toString();
}

function storeFilter(storeId: string) {
  return JSON.stringify({ name: "store_availability", value: storeId });
}

async function getJson(url: string, retries: number, dependencies: CotoClientDependencies): Promise<LooseRecord> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await (dependencies.sleep ?? sleep)(requestDelayMs());
      const { data } = await (dependencies.http ?? http).get(url);
      const parsed = typeof data === "string" ? (JSON.parse(data) as unknown) : data;
      if (!isRecord(parsed) || !isRecord(parsed.response)) throw new Error("Coto search returned an unexpected payload");
      return parsed.response;
    } catch (error) {
      lastError = error;
      if (attempt < retries) await (dependencies.sleep ?? sleep)(500 * attempt);
    }
  }
  throw lastError;
}

// "25%Dto" is Coto's percent-off label; the shared strict parser covers the
// "2do al 70%" / "X% Off" shapes. Card and bank promotions are rejected there.
const COTO_PERCENT_PATTERN = /^(\d{1,2})\s*%\s*dto\b/i;

export function parseCotoPromotion(text: string | null): SimplePromotion | null {
  if (!text) return null;
  const shared = parseSimplePromotion(text);
  if (shared) return shared;
  const match = COTO_PERCENT_PATTERN.exec(text.trim());
  const percent = match ? Number(match[1]) : 0;
  return percent > 0 && percent <= 99 ? { type: "percent-off", percent, maxUnits: null, label: `${percent}% OFF` } : null;
}

function slugify(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-").replace(/-+/g, "-");
}

function departmentOf(data: LooseRecord) {
  const group = records(data.groups)[0];
  return asString(records(group?.path_list)[1]?.display_name);
}

function promoOf(data: LooseRecord) {
  for (const discount of records(data.discounts)) {
    const promo = parseCotoPromotion(asString(discount.discountText));
    if (promo) return promo;
  }
  return null;
}

function identityOf(result: unknown) {
  const data = isRecord(result) && isRecord(result.data) ? result.data : null;
  if (!data) return null;
  const rawEan = data.product_main_ean;
  const ean = normalizeGtin(typeof rawEan === "number" ? String(rawEan) : asString(rawEan) ?? "");
  const name = asString(data.sku_display_name) ?? asString((result as LooseRecord).value);
  // A weighable product is priced per kilo with an in-store code, never a GTIN
  // another supermarket would share; it stays out like in the VTEX sources.
  if (!ean || !name || data.product_weighable === 1) return null;
  return { data, ean, name };
}

function branchOffer(data: LooseRecord, storeId: string) {
  const branch = records(data.price).find((entry) => entry.store === storeId);
  const price = asNumber(branch?.listPrice);
  const sold = !Array.isArray(data.store_availability) || data.store_availability.includes(storeId);
  const available = sold && price !== null && price > 0;
  return { available, price: available ? price : null, referencePrice: available ? asNumber(branch?.formatPrice) : null };
}

function productUrlOf(data: LooseRecord, name: string) {
  const url = asString(data.url);
  return url ? `${COTO_BASE_URL}/productos/${slugify(name)}/${url}` : null;
}

export function normalizeCotoResult(result: unknown, storeId = DEFAULT_STORE_ID): CotoProduct | null {
  const identity = identityOf(result);
  if (!identity) return null;
  const { data, ean, name } = identity;
  const offer = branchOffer(data, storeId);
  const imageUrl = asString(data.product_large_image_url) ?? asString(data.image_url);

  return {
    product: {
      ean,
      name,
      brand: asString(data.product_brand),
      description: asString(data.sku_description),
      imageUrl,
      images: imageUrl ? [imageUrl] : [],
      category: inferCategoryFromText(name) ?? departmentOf(data),
      skuId: asString(data.sku_id),
      sellerId: storeId,
      productUrl: productUrlOf(data, name),
      price: offer.price,
      listPrice: null,
      referencePrice: offer.referencePrice,
      referenceUnit: asString(data.product_format),
      isAvailable: offer.available,
    },
    promo: offer.available ? promoOf(data) : null,
  };
}

export type CotoSearch = { kind: "text"; value: string } | { kind: "group"; groupId: string };

function searchPath(search: CotoSearch) {
  return search.kind === "text"
    ? `/search/${encodeURIComponent(search.value)}`
    : `/browse/group_id/${encodeURIComponent(search.groupId)}`;
}

// Pages of up to 200 until `limit`, a short page or the last result. A first
// page that fails raises; a later one stops the paging and keeps what was read.
export async function fetchCotoProducts({
  search,
  limit,
  retries = 3,
  dependencies = {},
}: {
  search: CotoSearch;
  limit: number;
  retries?: number;
  dependencies?: CotoClientDependencies;
}): Promise<CotoProductsResult> {
  const storeId = storeIdOf(dependencies);
  const cap = Math.max(1, Math.floor(limit));
  const products = new Map<string, NormalizedProduct>();
  const promoByEan = new Map<string, SimplePromotion | null>();
  let pagesFailed = 0;

  for (let page = 1, read = 0; read < cap; page += 1) {
    const size = Math.min(COTO_PAGE_SIZE, cap - read);
    let response: LooseRecord;
    try {
      response = await getJson(constructorUrl(searchPath(search), { page, num_results_per_page: size, pre_filter_expression: storeFilter(storeId) }), retries, dependencies);
    } catch (error) {
      if (page === 1) throw error;
      pagesFailed += 1;
      break;
    }
    const results = records(response.results);
    read += results.length;
    for (const result of results) {
      const normalized = normalizeCotoResult(result, storeId);
      if (!normalized || products.has(normalized.product.ean)) continue;
      products.set(normalized.product.ean, normalized.product);
      promoByEan.set(normalized.product.ean, normalized.promo);
    }
    if (results.length < size) break;
  }

  const result: CotoProductsResult = Array.from(products.values());
  result.promoByEan = promoByEan;
  result.pagesFailed = pagesFailed;
  return result;
}

// Top-up read by EAN: Constructor matches the EAN as a search term; only an
// exact GTIN match counts. Found but not sold at the branch -> unavailable.
export async function lookupCotoByEan(ean: string, dependencies: CotoClientDependencies = {}): Promise<CotoProduct | null> {
  const key = normalizeGtin(ean);
  if (!key) return null;
  const storeId = storeIdOf(dependencies);
  const response = await getJson(constructorUrl(`/search/${key.replace(/^0+/, "")}`, { page: 1, num_results_per_page: 10 }), 3, dependencies);
  for (const result of records(response.results)) {
    const normalized = normalizeCotoResult(result, storeId);
    if (normalized?.product.ean === key) return normalized;
  }
  return null;
}

// The category tree in the shape the discovery plan reads
// ([{ id, name, hasChildren, children }]): Constructor lists the departments
// at the root and a department's subcategories when it is browsed.
export async function fetchCotoCategoryTree(dependencies: CotoClientDependencies = {}): Promise<unknown> {
  const root = await getJson(constructorUrl("/browse/groups", {}), 3, dependencies);
  const departments = records(records(root.groups)[0]?.children);
  const tree = [];
  for (const department of departments) {
    const groupId = asString(department.group_id) ?? "";
    const id = cotoNumberFromGroupId(groupId);
    if (id === null) continue;
    const browsed = await getJson(constructorUrl(searchPath({ kind: "group", groupId }), { page: 1, num_results_per_page: 1 }), 3, dependencies);
    const children = records(records(browsed.groups)[0]?.children)
      .map((child) => ({ id: cotoNumberFromGroupId(asString(child.group_id) ?? ""), name: asString(child.display_name) }))
      .filter((child): child is { id: number; name: string } => child.id !== null && child.name !== null)
      .map((child) => ({ ...child, hasChildren: false, children: [] }));
    tree.push({ id, name: asString(department.display_name) ?? groupId, hasChildren: children.length > 0, children });
  }
  return tree;
}
