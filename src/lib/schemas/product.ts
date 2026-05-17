import { z } from "zod";

const numericParam = z.preprocess((value) => {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
}, z.number().nonnegative().optional());

export const productSortSchema = z.enum([
  "relevance",
  "discount",
  "price-asc",
  "price-desc",
  "updated",
]);

export const productListQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  category: z.string().trim().max(120).optional(),
  super: z.string().trim().max(40).optional(),
  sort: productSortSchema.optional(),
  offers: z
    .enum(["0", "1", "false", "true"])
    .transform((value) => value === "1" || value === "true")
    .optional(),
  minPrice: numericParam,
  maxPrice: numericParam,
  page: z.preprocess((value) => Number(value ?? 1), z.number().int().min(1).default(1)),
  limit: z.preprocess((value) => Number(value ?? 24), z.number().int().min(1).max(48).default(24)),
});

export const productHistoryQuerySchema = z.object({
  days: z.preprocess((value) => Number(value ?? 30), z.number().int().min(7).max(90).default(30)),
});
