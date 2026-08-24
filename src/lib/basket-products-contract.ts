import { z } from "zod";

export const BASKET_PRODUCTS_BATCH_SIZE = 24;

export function buildDatabaseCatalogResponse<T extends { dataSource?: unknown }, TUnavailable>(
  data: T | null,
  unavailable: TUnavailable,
) {
  return data?.dataSource === "database"
    ? { status: 200, body: data }
    : { status: 503, body: unavailable };
}

const eanSchema = z.string().trim().regex(/^\d{8,18}$/, "Invalid EAN");

export const basketProductsBodySchema = z
  .object({ eans: z.array(eanSchema).min(1).max(BASKET_PRODUCTS_BATCH_SIZE) })
  .strict()
  .transform(({ eans }) => ({ eans: Array.from(new Set(eans)) }));

const nullableString = z.string().nullable();
const nullableTimestamp = z.string().datetime({ offset: true }).nullable();
export const basketProductsResponseSchema = z.object({
  items: z.array(z.object({
    ean: eanSchema,
    name: z.string(),
    brand: nullableString,
    imageUrl: nullableString,
    minPrice: z.number().nullable(),
    freshMinPrice: z.number().nullable(),
    hasFreshPrice: z.boolean(),
    priceEntries: z.array(z.object({
      supermarket: z.object({ id: z.number().int(), name: z.string(), slug: z.string(), logoUrl: nullableString }).strict(),
      price: z.number().nullable(),
      isAvailable: z.boolean(),
      productUrl: nullableString,
      freshnessStatus: z.enum(["fresh", "stale", "unknown"]),
    }).strict()),
  }).strict()),
  missing: z.array(eanSchema),
  dataSource: z.literal("database"),
  degraded: z.boolean(),
  verifiedAt: z.string().datetime({ offset: true }),
  latestCheckedAt: nullableTimestamp,
}).strict();

export type BasketProduct = z.infer<typeof basketProductsResponseSchema>["items"][number];
