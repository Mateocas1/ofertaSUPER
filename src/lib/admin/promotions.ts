import "server-only";

import { Prisma, type PromotionType as PrismaPromotionType } from "@prisma/client";

import { db } from "@/lib/db";
import type {
  AdminPromotionRecord,
  AdminPromotionStatus,
  AdminSupermarketOption,
  PromotionTypeValue,
  PromotionUpsertInput,
} from "@/lib/schemas/promotion";

export class AdminPromotionError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "AdminPromotionError";
    this.status = status;
  }
}

function toPromotionEnum(type: PromotionTypeValue): PrismaPromotionType {
  switch (type) {
    case "2x1":
      return "TWO_FOR_ONE";
    case "2nd_50":
      return "SECOND_HALF";
    case "wallet_discount":
      return "WALLET_DISCOUNT";
    case "bank_discount":
      return "BANK_DISCOUNT";
    default:
      return "PERCENTAGE";
  }
}

function fromPromotionEnum(type: string): PromotionTypeValue {
  switch (type) {
    case "TWO_FOR_ONE":
      return "2x1";
    case "SECOND_HALF":
      return "2nd_50";
    case "WALLET_DISCOUNT":
      return "wallet_discount";
    case "BANK_DISCOUNT":
      return "bank_discount";
    default:
      return "percentage";
  }
}

function toNumber(value: Prisma.Decimal | null) {
  return value === null ? null : Number(value);
}

function toIsoDate(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : null;
}

function getNow() {
  return new Date();
}

export function getPromotionLifecycleStatus(
  promotion: {
    is_active: boolean;
    start_date: Date | null;
    end_date: Date | null;
  },
  now = getNow(),
): Exclude<AdminPromotionStatus, "all"> {
  if (!promotion.is_active) {
    return "inactive";
  }

  if (promotion.start_date && promotion.start_date > now) {
    return "scheduled";
  }

  if (promotion.end_date && promotion.end_date < now) {
    return "expired";
  }

  return "active";
}

function normalizeProductEans(productEans: string[]) {
  return [...new Set(productEans.map((entry) => entry.trim()).filter(Boolean))];
}

function toDate(value: string | undefined) {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

async function assertSupermarketExists(supermarketId: number) {
  const supermarket = await db.supermarket.findUnique({
    where: { id: supermarketId },
    select: { id: true },
  });

  if (!supermarket) {
    throw new AdminPromotionError("El supermercado seleccionado no existe.", 400);
  }
}

async function assertProductsExist(productEans: string[]) {
  if (productEans.length === 0) {
    return;
  }

  const existingProducts = await db.product.findMany({
    where: {
      ean: {
        in: productEans,
      },
    },
    select: {
      ean: true,
    },
  });

  const existing = new Set(existingProducts.map((product) => product.ean));
  const missing = productEans.filter((ean) => !existing.has(ean));

  if (missing.length > 0) {
    throw new AdminPromotionError(`Los siguientes EAN no existen en la base: ${missing.join(", ")}.`, 400);
  }
}

function mapPromotionRecord(promotion: {
  id: number;
  supermarket_id: number;
  title: string;
  type: string;
  wallet_provider: string | null;
  bank_name: string | null;
  discount_value: Prisma.Decimal | null;
  conditions: string | null;
  start_date: Date | null;
  end_date: Date | null;
  is_active: boolean;
  promotion_products: Array<{ product_ean: string }>;
  supermarket: {
    id: number;
    name: string;
    slug: string;
    logo_url: string | null;
  };
}): AdminPromotionRecord {
  const lifecycleStatus = getPromotionLifecycleStatus(promotion);

  return {
    id: promotion.id,
    supermarketId: promotion.supermarket_id,
    title: promotion.title,
    type: fromPromotionEnum(promotion.type),
    walletProvider: promotion.wallet_provider,
    bankName: promotion.bank_name,
    discountValue: toNumber(promotion.discount_value),
    conditions: promotion.conditions,
    startDate: toIsoDate(promotion.start_date),
    endDate: toIsoDate(promotion.end_date),
    isActive: promotion.is_active,
    lifecycleStatus,
    productEans: promotion.promotion_products.map((entry) => entry.product_ean),
    supermarket: {
      id: promotion.supermarket.id,
      name: promotion.supermarket.name,
      slug: promotion.supermarket.slug,
      logoUrl: promotion.supermarket.logo_url,
    },
  };
}

type ListAdminPromotionsFilters = {
  status?: AdminPromotionStatus;
  supermarket?: string;
  type?: PromotionTypeValue;
  query?: string;
};

function buildListAdminPromotionsWhere(filters: ListAdminPromotionsFilters): Prisma.PromotionWhereInput {
  const now = getNow();
  const clauses: Prisma.PromotionWhereInput[] = [];

  if (filters.status && filters.status !== "all") {
    switch (filters.status) {
      case "active":
        clauses.push(
          { is_active: true },
          { OR: [{ start_date: null }, { start_date: { lte: now } }] },
          { OR: [{ end_date: null }, { end_date: { gte: now } }] },
        );
        break;
      case "scheduled":
        clauses.push({ is_active: true }, { start_date: { gt: now } });
        break;
      case "expired":
        clauses.push({ end_date: { lt: now } });
        break;
      case "inactive":
        clauses.push({ is_active: false });
        break;
      default:
        break;
    }
  }

  if (filters.supermarket) {
    clauses.push({
      supermarket: {
        slug: filters.supermarket,
      },
    });
  }

  if (filters.type) {
    clauses.push({
      type: toPromotionEnum(filters.type),
    });
  }

  if (filters.query) {
    clauses.push({
      OR: [
        { title: { contains: filters.query, mode: "insensitive" } },
        { wallet_provider: { contains: filters.query, mode: "insensitive" } },
        { bank_name: { contains: filters.query, mode: "insensitive" } },
        { conditions: { contains: filters.query, mode: "insensitive" } },
      ],
    });
  }

  return clauses.length > 0 ? { AND: clauses } : {};
}

export async function listAdminSupermarkets(): Promise<AdminSupermarketOption[]> {
  const supermarkets = await db.supermarket.findMany({
    orderBy: {
      name: "asc",
    },
    select: {
      id: true,
      name: true,
      slug: true,
    },
  });

  return supermarkets;
}

export async function listAdminPromotions(
  filters: ListAdminPromotionsFilters = {},
): Promise<AdminPromotionRecord[]> {
  const promotions = await db.promotion.findMany({
    where: buildListAdminPromotionsWhere(filters),
    orderBy: [{ is_active: "desc" }, { start_date: "desc" }, { id: "desc" }],
    select: {
      id: true,
      supermarket_id: true,
      title: true,
      type: true,
      wallet_provider: true,
      bank_name: true,
      discount_value: true,
      conditions: true,
      start_date: true,
      end_date: true,
      is_active: true,
      promotion_products: {
        orderBy: {
          product_ean: "asc",
        },
        select: {
          product_ean: true,
        },
      },
      supermarket: {
        select: {
          id: true,
          name: true,
          slug: true,
          logo_url: true,
        },
      },
    },
  });

  return promotions.map(mapPromotionRecord);
}

export async function getAdminPromotionStats() {
  const today = new Date();
  const [total, active, scheduled, expired] = await Promise.all([
    db.promotion.count(),
    db.promotion.count({ where: { is_active: true } }),
    db.promotion.count({
      where: {
        start_date: {
          gt: today,
        },
      },
    }),
    db.promotion.count({
      where: {
        end_date: {
          lt: today,
        },
      },
    }),
  ]);

  return { total, active, scheduled, expired };
}

export async function createPromotion(input: PromotionUpsertInput): Promise<AdminPromotionRecord> {
  const productEans = normalizeProductEans(input.productEans);

  await Promise.all([assertSupermarketExists(input.supermarketId), assertProductsExist(productEans)]);

  const promotion = await db.promotion.create({
    data: {
      supermarket_id: input.supermarketId,
      type: toPromotionEnum(input.type),
      title: input.title.trim(),
      wallet_provider: input.walletProvider ?? null,
      bank_name: input.bankName ?? null,
      discount_value: input.discountValue ?? null,
      conditions: input.conditions ?? null,
      start_date: toDate(input.startDate),
      end_date: toDate(input.endDate),
      is_active: input.isActive,
      promotion_products:
        productEans.length > 0
          ? {
              create: productEans.map((productEan) => ({
                product: {
                  connect: {
                    ean: productEan,
                  },
                },
              })),
            }
          : undefined,
    },
    select: {
      id: true,
      supermarket_id: true,
      title: true,
      type: true,
      wallet_provider: true,
      bank_name: true,
      discount_value: true,
      conditions: true,
      start_date: true,
      end_date: true,
      is_active: true,
      promotion_products: {
        orderBy: {
          product_ean: "asc",
        },
        select: {
          product_ean: true,
        },
      },
      supermarket: {
        select: {
          id: true,
          name: true,
          slug: true,
          logo_url: true,
        },
      },
    },
  });

  return mapPromotionRecord(promotion);
}

export async function updatePromotion(id: number, input: PromotionUpsertInput): Promise<AdminPromotionRecord> {
  const productEans = normalizeProductEans(input.productEans);

  await Promise.all([assertSupermarketExists(input.supermarketId), assertProductsExist(productEans)]);

  try {
    const promotion = await db.promotion.update({
      where: { id },
      data: {
        supermarket_id: input.supermarketId,
        type: toPromotionEnum(input.type),
        title: input.title.trim(),
        wallet_provider: input.walletProvider ?? null,
        bank_name: input.bankName ?? null,
        discount_value: input.discountValue ?? null,
        conditions: input.conditions ?? null,
        start_date: toDate(input.startDate),
        end_date: toDate(input.endDate),
        is_active: input.isActive,
        promotion_products: {
          deleteMany: {},
          ...(productEans.length > 0
            ? {
                create: productEans.map((productEan) => ({
                  product: {
                    connect: {
                      ean: productEan,
                    },
                  },
                })),
              }
            : {}),
        },
      },
      select: {
        id: true,
        supermarket_id: true,
        title: true,
        type: true,
        wallet_provider: true,
        bank_name: true,
        discount_value: true,
        conditions: true,
        start_date: true,
        end_date: true,
        is_active: true,
        promotion_products: {
          orderBy: {
            product_ean: "asc",
          },
          select: {
            product_ean: true,
          },
        },
        supermarket: {
          select: {
            id: true,
            name: true,
            slug: true,
            logo_url: true,
          },
        },
      },
    });

    return mapPromotionRecord(promotion);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      throw new AdminPromotionError("La promocion que intentas editar no existe.", 404);
    }

    throw error;
  }
}

export async function deletePromotion(id: number) {
  try {
    await db.promotion.delete({
      where: { id },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      throw new AdminPromotionError("La promocion que intentas eliminar no existe.", 404);
    }

    throw error;
  }
}