import { z } from "zod";

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(120),
  limit: z.preprocess((value) => Number(value ?? 8), z.number().int().min(1).max(12).default(8)),
});
