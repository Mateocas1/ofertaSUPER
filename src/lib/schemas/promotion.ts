import { z } from "zod";

export const promotionTypeSchema = z.enum([
  "2x1",
  "2nd_50",
  "wallet_discount",
  "bank_discount",
  "percentage",
]);

export const promotionListQuerySchema = z.object({
  super: z.string().trim().max(40).optional(),
  wallet: z.string().trim().max(80).optional(),
  type: promotionTypeSchema.optional(),
});

const optionalString = z.preprocess(
  (value) => {
    if (typeof value !== "string") {
      return value;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  },
  z.string().trim().optional(),
);

const optionalNumber = z.preprocess((value) => {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
}, z.number().nonnegative().optional());

const optionalDate = z.preprocess((value) => {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }

  return value;
}, z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional());

const productEanSchema = z.string().trim().regex(/^\d{8,18}$/);

const productEansSchema = z.preprocess((value) => {
  if (typeof value === "string") {
    return value
      .split(/[\n,;\s]+/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return value;
}, z.array(productEanSchema).max(200).default([]));

export const promotionTypeOptions = [
  { value: "2x1", label: "2x1" },
  { value: "2nd_50", label: "2da al 50%" },
  { value: "wallet_discount", label: "Billetera" },
  { value: "bank_discount", label: "Banco" },
  { value: "percentage", label: "% Off" },
] as const;

export const promotionUpsertSchema = z
  .object({
    supermarketId: z.coerce.number().int().positive(),
    type: promotionTypeSchema,
    title: z.string().trim().min(3).max(160),
    walletProvider: optionalString,
    bankName: optionalString,
    discountValue: optionalNumber,
    conditions: optionalString.pipe(z.string().max(400).optional()),
    startDate: optionalDate,
    endDate: optionalDate,
    isActive: z.boolean().default(true),
    productEans: productEansSchema,
  })
  .superRefine((value, context) => {
    if (value.type === "wallet_discount" && !value.walletProvider) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "La promo de billetera requiere walletProvider.",
        path: ["walletProvider"],
      });
    }

    if (value.type === "bank_discount" && !value.bankName) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "La promo bancaria requiere bankName.",
        path: ["bankName"],
      });
    }

    if (value.startDate && value.endDate && value.endDate < value.startDate) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "La fecha de fin no puede ser anterior a la fecha de inicio.",
        path: ["endDate"],
      });
    }
  });

export const promotionIdSchema = z.coerce.number().int().positive();

export type PromotionTypeValue = z.infer<typeof promotionTypeSchema>;
export type PromotionUpsertInput = z.infer<typeof promotionUpsertSchema>;
export type AdminPromotionStatus = "all" | "active" | "scheduled" | "expired" | "inactive";

export type AdminPromotionRecord = {
  id: number;
  supermarketId: number;
  title: string;
  type: PromotionTypeValue;
  walletProvider: string | null;
  bankName: string | null;
  discountValue: number | null;
  conditions: string | null;
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
  lifecycleStatus: Exclude<AdminPromotionStatus, "all">;
  productEans: string[];
  supermarket: {
    id: number;
    name: string;
    slug: string;
    logoUrl: string | null;
  };
};

export type AdminSupermarketOption = {
  id: number;
  name: string;
  slug: string;
};
