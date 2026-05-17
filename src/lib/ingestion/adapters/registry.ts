import { listVtexSupermarkets } from "@/lib/supermarkets";

import type { SourceAdapter } from "./types";
import { VtexSourceAdapter } from "./vtex-adapter";

const adapterRegistry = new Map<string, SourceAdapter>(
  listVtexSupermarkets().map((supermarket) => [supermarket.slug, new VtexSourceAdapter(supermarket)]),
);

export function getSourceAdapter(slug: string) {
  const adapter = adapterRegistry.get(slug);

  if (!adapter) {
    throw new Error(`No ingestion adapter registered for source ${slug}`);
  }

  return adapter;
}

export function listSourceAdapters() {
  return Array.from(adapterRegistry.values());
}