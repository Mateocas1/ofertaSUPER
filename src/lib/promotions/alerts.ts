type PriceDropAlert = {
  previousPrice: number;
  currentPrice: number;
  amountDrop: number;
  percentDrop: number;
};

type PriceMovement = {
  previousPrice: number | null;
  currentPrice: number | null;
  deltaAmount: number | null;
  deltaPercent: number | null;
  priceDropAlert: PriceDropAlert | null;
};

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function detectPriceDrop(currentPrice: number | null, previousPrice: number | null): PriceDropAlert | null {
  if (
    currentPrice === null ||
    previousPrice === null ||
    previousPrice <= 0 ||
    currentPrice >= previousPrice
  ) {
    return null;
  }

  const amountDrop = roundCurrency(previousPrice - currentPrice);
  const percentDrop = roundCurrency((amountDrop / previousPrice) * 100);

  return {
    previousPrice,
    currentPrice,
    amountDrop,
    percentDrop,
  };
}

export function comparePriceAgainstHistory(
  currentPrice: number | null,
  previousPrice: number | null,
): PriceMovement {
  if (currentPrice === null || previousPrice === null || previousPrice <= 0) {
    return {
      previousPrice,
      currentPrice,
      deltaAmount: null,
      deltaPercent: null,
      priceDropAlert: null,
    };
  }

  const deltaAmount = roundCurrency(currentPrice - previousPrice);
  const deltaPercent = roundCurrency((deltaAmount / previousPrice) * 100);

  return {
    previousPrice,
    currentPrice,
    deltaAmount,
    deltaPercent,
    priceDropAlert: detectPriceDrop(currentPrice, previousPrice),
  };
}

export function getBiggestPriceDropAlert<TAlert extends PriceDropAlert>(
  alerts: Array<TAlert | null | undefined>,
): TAlert | null {
  let biggestAlert: TAlert | null = null;

  for (const alert of alerts) {
    if (!alert) {
      continue;
    }

    if (!biggestAlert || alert.percentDrop > biggestAlert.percentDrop) {
      biggestAlert = alert;
    }
  }

  return biggestAlert;
}

export type { PriceDropAlert, PriceMovement };