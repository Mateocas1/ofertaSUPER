import {
  BASKET_PRODUCTS_BATCH_SIZE,
  basketProductsResponseSchema,
  type BasketProduct,
} from "@/lib/basket-products-contract";

class BasketProvenanceError extends Error {
  constructor() { super("No se pudo cargar la canasta."); }
}

export class BasketCatalogUnavailableError extends Error {
  constructor() {
    super("El catálogo no está disponible en este momento. Intenta nuevamente más tarde.");
    this.name = "BasketCatalogUnavailableError";
  }
}

type BasketProvenance = { degraded: boolean; verifiedAt: string };
type BasketChunk = BasketProvenance & { items: BasketProduct[]; missing: string[] };

function assertDatabaseProvenance(value: unknown) {
  if (!value || typeof value !== "object" || (value as { dataSource?: unknown }).dataSource !== "database") {
    throw new BasketProvenanceError();
  }
}

function assertChunkCorrespondence(chunk: string[], parsed: BasketChunk) {
  const returned = [...parsed.items.map(({ ean }) => ean), ...parsed.missing];
  const hasExactCorrespondence = new Set(returned).size === returned.length
    && returned.every((ean) => chunk.includes(ean))
    && chunk.every((ean) => returned.includes(ean));

  if (!hasExactCorrespondence) throw new Error("Invalid chunk correspondence");
}

async function loadBasketChunk(chunk: string[], signal?: AbortSignal) {
  const response = await fetch("/api/products/batch", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ eans: chunk }), signal,
  });

  if (response.status === 503) throw new BasketCatalogUnavailableError();
  if (!response.ok) throw new Error("Unavailable chunk");

  const payload = await response.json();
  assertDatabaseProvenance(payload);
  const parsed = basketProductsResponseSchema.parse(payload);
  assertChunkCorrespondence(chunk, parsed);
  return parsed;
}

function mergeChunk(
  parsed: BasketChunk,
  products: Map<string, BasketProduct>,
  unavailable: Set<string>,
  provenance: BasketProvenance | undefined,
) {
  if (provenance && provenance.verifiedAt !== parsed.verifiedAt) throw new BasketProvenanceError();
  parsed.items.forEach((product) => products.set(product.ean, product));
  parsed.missing.forEach((ean) => unavailable.add(ean));

  const nextProvenance = provenance ?? { degraded: parsed.degraded, verifiedAt: parsed.verifiedAt };
  nextProvenance.degraded ||= parsed.degraded;
  return nextProvenance;
}

function isTerminalBasketError(error: unknown, signal?: AbortSignal) {
  return signal?.aborted || error instanceof BasketProvenanceError || error instanceof BasketCatalogUnavailableError;
}

function basketResult(
  requested: string[],
  products: Map<string, BasketProduct>,
  unavailable: Set<string>,
  provenance: BasketProvenance | undefined,
) {
  return {
    items: requested.flatMap((ean) => products.get(ean) ?? []),
    missing: requested.filter((ean) => unavailable.has(ean)),
    dataSource: "database" as const,
    degraded: provenance?.degraded ?? false,
    verifiedAt: provenance?.verifiedAt ?? null,
    degradedDemo: false,
  };
}

export async function fetchBasketProducts(eans: string[], signal?: AbortSignal) {
  const requested = Array.from(new Set(eans));
  const products = new Map<string, BasketProduct>();
  const unavailable = new Set<string>();
  let successfulChunks = 0;
  let provenance: BasketProvenance | undefined;

  for (let offset = 0; offset < requested.length; offset += BASKET_PRODUCTS_BATCH_SIZE) {
    const chunk = requested.slice(offset, offset + BASKET_PRODUCTS_BATCH_SIZE);
    try {
      provenance = mergeChunk(await loadBasketChunk(chunk, signal), products, unavailable, provenance);
      successfulChunks += 1;
    } catch (error) {
      if (isTerminalBasketError(error, signal)) throw error;
      chunk.forEach((ean) => unavailable.add(ean));
    }
  }

  if (requested.length > 0 && successfulChunks === 0) throw new Error("No se pudo cargar la canasta.");
  return basketResult(requested, products, unavailable, provenance);
}
