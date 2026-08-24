import {
  BASKET_PRODUCTS_BATCH_SIZE,
  basketProductsResponseSchema,
  type BasketProduct,
} from "@/lib/basket-products-contract";

class BasketProvenanceError extends Error {
  constructor() { super("No se pudo cargar la canasta."); }
}

function assertDatabaseProvenance(value: unknown) {
  if (!value || typeof value !== "object" || (value as { dataSource?: unknown }).dataSource !== "database") {
    throw new BasketProvenanceError();
  }
}

export async function fetchBasketProducts(eans: string[], signal?: AbortSignal) {
  const requested = Array.from(new Set(eans));
  const products = new Map<string, BasketProduct>();
  const unavailable = new Set<string>();
  let successfulChunks = 0;
  let provenance: { degraded: boolean; verifiedAt: string } | undefined;

  for (let offset = 0; offset < requested.length; offset += BASKET_PRODUCTS_BATCH_SIZE) {
    const chunk = requested.slice(offset, offset + BASKET_PRODUCTS_BATCH_SIZE);
    try {
      const response = await fetch("/api/products/batch", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ eans: chunk }), signal,
      });
      if (!response.ok) throw new Error("Unavailable chunk");
      const payload = await response.json();
      assertDatabaseProvenance(payload);
      const parsed = basketProductsResponseSchema.parse(payload);
      if (provenance && provenance.verifiedAt !== parsed.verifiedAt) throw new BasketProvenanceError();
      const returned = [...parsed.items.map(({ ean }) => ean), ...parsed.missing];
      if (new Set(returned).size !== returned.length || returned.some((ean) => !chunk.includes(ean)) ||
          chunk.some((ean) => !returned.includes(ean))) throw new Error("Invalid chunk correspondence");
      parsed.items.forEach((product) => products.set(product.ean, product));
      parsed.missing.forEach((ean) => unavailable.add(ean));
      successfulChunks += 1;
      provenance ??= { degraded: parsed.degraded, verifiedAt: parsed.verifiedAt };
      provenance.degraded ||= parsed.degraded;
    } catch (error) {
      if (signal?.aborted || error instanceof BasketProvenanceError) throw error;
      chunk.forEach((ean) => unavailable.add(ean));
    }
  }

  if (requested.length > 0 && successfulChunks === 0) throw new Error("No se pudo cargar la canasta.");
  return {
    items: requested.flatMap((ean) => products.get(ean) ?? []),
    missing: requested.filter((ean) => unavailable.has(ean)),
    dataSource: "database" as const,
    degraded: provenance?.degraded ?? false,
    verifiedAt: provenance?.verifiedAt ?? null,
    degradedDemo: false,
  };
}
