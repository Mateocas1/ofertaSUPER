import { listVtexSupermarkets } from "@/lib/supermarkets";

import { CotoSourceAdapter } from "./coto-adapter";
import type { SourceAdapter } from "./types";
import { VtexSourceAdapter } from "./vtex-adapter";

const adapterRegistry = new Map<string, SourceAdapter>([
  ...listVtexSupermarkets().map((supermarket): [string, SourceAdapter] => [supermarket.slug, new VtexSourceAdapter(supermarket)]),
  ["coto", new CotoSourceAdapter()],
]);

export function getSourceAdapter(slug: string) {
  const adapter = adapterRegistry.get(slug);

  if (!adapter) {
    throw new Error(`No ingestion adapter registered for source ${slug}`);
  }

  return adapter;
}
