import "server-only";

import type { ProductDetail } from "@/lib/catalog";

type CatalogEnvironment = Record<string, string | undefined>;
type ProductDetailRouteDependencies = {
  loadDetail: (ean: string) => Promise<ProductDetail | null>;
  readCache: (ean: string) => Promise<ProductDetail | null>;
  writeCache: (ean: string, product: ProductDetail) => Promise<void>;
};

export async function resolveProductDetail(
  ean: string,
  loadDatabaseDetail: (ean: string) => Promise<ProductDetail | null>,
  env: CatalogEnvironment = process.env,
) {
  void env;
  return loadDatabaseDetail(ean);
}

export async function resolveRouteProductDetail(
  ean: string,
  dependencies: ProductDetailRouteDependencies,
  env: CatalogEnvironment = process.env,
) {
  void env;
  const cached = await dependencies.readCache(ean);
  if (cached) return cached;
  const product = await dependencies.loadDetail(ean);
  if (product) await dependencies.writeCache(ean, product);
  return product;
}

export function resolveOfflineBasketProducts(eans: string[], env: CatalogEnvironment = process.env) {
  void eans;
  void env;
  return null;
}
