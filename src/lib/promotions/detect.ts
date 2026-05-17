type PromotionType = "2x1" | "2nd_50" | "wallet_discount" | "bank_discount" | "percentage";

type CalculablePromotion = {
  type: PromotionType;
  discountValue: number | null;
};

type AutomaticDiscount = {
  percentOff: number;
  amountOff: number;
};

type BestPromotionResult<TPromotion extends CalculablePromotion> = {
  promotion: TPromotion;
  finalPrice: number;
};

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

export function detectAutomaticDiscount(price: number | null, listPrice: number | null): AutomaticDiscount | null {
  if (price === null || listPrice === null || listPrice <= price || listPrice <= 0) {
    return null;
  }

  return {
    percentOff: ((listPrice - price) / listPrice) * 100,
    amountOff: roundCurrency(listPrice - price),
  };
}

export function calculatePromotionalUnitPrice(
  basePrice: number | null,
  promotion: CalculablePromotion,
): number | null {
  if (basePrice === null || basePrice <= 0) {
    return null;
  }

  switch (promotion.type) {
    case "2x1":
      return roundCurrency(basePrice / 2);
    case "2nd_50":
      return roundCurrency(basePrice * 0.75);
    case "wallet_discount":
    case "bank_discount":
    case "percentage": {
      if (promotion.discountValue === null || promotion.discountValue <= 0 || promotion.discountValue > 100) {
        return null;
      }

      return roundCurrency(basePrice * (1 - promotion.discountValue / 100));
    }
    default:
      return null;
  }
}

export function getBestPromotionPrice<TPromotion extends CalculablePromotion>(
  basePrice: number | null,
  promotions: TPromotion[],
): BestPromotionResult<TPromotion> | null {
  if (basePrice === null) {
    return null;
  }

  let bestResult: BestPromotionResult<TPromotion> | null = null;

  for (const promotion of promotions) {
    const finalPrice = calculatePromotionalUnitPrice(basePrice, promotion);

    if (finalPrice === null || finalPrice >= basePrice) {
      continue;
    }

    if (!bestResult || finalPrice < bestResult.finalPrice) {
      bestResult = {
        promotion,
        finalPrice,
      };
    }
  }

  return bestResult;
}