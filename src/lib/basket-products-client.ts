import {
  BASKET_PRODUCTS_BATCH_SIZE,
  basketProductsResponseSchema,
  type BasketProduct,
} from "@/lib/basket-products-contract";

export async function fetchBasketProducts(eans: string[], signal?: AbortSignal) {
  const requested = Array.from(new Set(eans));
  const products = new Map<string, BasketProduct>();
  const unavailable = new Set<string>();
  let successfulChunks = 0;

  for (let offset = 0; offset < requested.length; offset += BASKET_PRODUCTS_BATCH_SIZE) {
    const chunk = requested.slice(offset, offset + BASKET_PRODUCTS_BATCH_SIZE);
    try {
      const response = await fetch("/api/products/batch", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ eans: chunk }), signal,
      });
      if (!response.ok) throw new Error("Unavailable chunk");
      const parsed = basketProductsResponseSchema.parse(await response.json());
      const returned = [...parsed.items.map(({ ean }) => ean), ...parsed.missing];
      if (new Set(returned).size !== returned.length || returned.some((ean) => !chunk.includes(ean)) ||
          chunk.some((ean) => !returned.includes(ean))) throw new Error("Invalid chunk correspondence");
      parsed.items.forEach((product) => products.set(product.ean, product));
      parsed.missing.forEach((ean) => unavailable.add(ean));
      successfulChunks += 1;
    } catch (error) {
      if (signal?.aborted) throw error;
      chunk.forEach((ean) => unavailable.add(ean));
    }
  }

  if (requested.length > 0 && successfulChunks === 0) throw new Error("No se pudo cargar la canasta.");
  return {
    items: requested.flatMap((ean) => products.get(ean) ?? []),
    missing: requested.filter((ean) => unavailable.has(ean)),
  };
}
