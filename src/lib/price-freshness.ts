export type PriceFreshnessStatus = "fresh" | "stale" | "unknown";

export type PriceFreshness = {
  status: PriceFreshnessStatus;
  checkedAt: string | null;
  ageHours: number | null;
  maxAgeHours: number;
};

const DEFAULT_MAX_AGE_HOURS = 24;
const HOURS_PER_DAY = 24;
const MS_PER_HOUR = 60 * 60 * 1000;

type FreshnessOptions = {
  now?: Date;
  maxAgeHours?: number | null;
};

function normalizeMaxAgeHours(value: number | null | undefined) {
  return Number.isFinite(value) && value && value > 0 ? value : DEFAULT_MAX_AGE_HOURS;
}

export function classifyPriceFreshness(
  checkedAt: string | Date | null | undefined,
  options: FreshnessOptions = {},
): PriceFreshness {
  const maxAgeHours = normalizeMaxAgeHours(options.maxAgeHours);

  if (!checkedAt) {
    return {
      status: "unknown",
      checkedAt: null,
      ageHours: null,
      maxAgeHours,
    };
  }

  const date = typeof checkedAt === "string" ? new Date(checkedAt) : checkedAt;

  if (Number.isNaN(date.getTime())) {
    return {
      status: "unknown",
      checkedAt: null,
      ageHours: null,
      maxAgeHours,
    };
  }

  const now = options.now ?? new Date();
  const ageHours = Math.max(0, (now.getTime() - date.getTime()) / MS_PER_HOUR);

  return {
    status: ageHours <= maxAgeHours ? "fresh" : "stale",
    checkedAt: date.toISOString(),
    ageHours,
    maxAgeHours,
  };
}

export function getStalenessAgeDays(freshness: PriceFreshness) {
  return freshness.ageHours === null ? null : Math.floor(freshness.ageHours / HOURS_PER_DAY);
}

export function getPriceFreshnessCopy(freshness: PriceFreshness) {
  switch (freshness.status) {
    case "fresh":
      return {
        priceLabel: "Precio reciente",
        badgeLabel: "Reciente",
        helperText: "Precio verificado dentro de la ventana de frescura.",
      };
    case "stale":
      return {
        priceLabel: "Ultimo precio registrado",
        badgeLabel: "Dato viejo",
        helperText: "Puede estar desactualizado. Revisalo en la web del super antes de comprar.",
      };
    default:
      return {
        priceLabel: "Precio registrado",
        badgeLabel: "Sin fecha",
        helperText: "No tenemos fecha de actualizacion para este precio.",
      };
  }
}
