export function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "Sin precio";
  }

  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);
}

const MINUS = "\u2212";

function percentFormatter(digits: number) {
  return new Intl.NumberFormat("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: digits });
}

function isMissing(value: number | null | undefined): value is null | undefined {
  return value === null || value === undefined || Number.isNaN(value);
}

/** Signed es-AR percentage for movements: "+2,5%", "−3,1%", "0%". */
export function formatSignedPercent(value: number | null | undefined, digits = 1) {
  if (isMissing(value)) {
    return "-";
  }

  const rounded = Number(value.toFixed(digits));
  const body = percentFormatter(digits).format(Math.abs(rounded));
  if (rounded > 0) return `+${body}%`;
  if (rounded < 0) return `${MINUS}${body}%`;
  return `${body}%`;
}

/** Kept for existing callers: a signed es-AR percentage. */
export function formatPercent(value: number | null | undefined, digits = 1) {
  return formatSignedPercent(value, digits);
}

/** Unsigned es-AR percentage for shares and rates: "45,2%". */
export function formatPercentage(value: number | null | undefined, digits = 1) {
  if (isMissing(value)) {
    return "-";
  }

  return `${percentFormatter(digits).format(value)}%`;
}

/**
 * A discount is a reduction, so it always reads with a minus sign, whatever
 * sign the caller stores it with: 46 -> "−46%".
 */
export function formatDiscountPercent(percentOff: number | null | undefined, digits = 0) {
  if (isMissing(percentOff)) {
    return "-";
  }

  return `${MINUS}${percentFormatter(digits).format(Math.abs(percentOff))}%`;
}

/** "1 supermercado", "3 supermercados". Pass the plural when it is irregular. */
export function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function formatCompactNumber(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }

  return new Intl.NumberFormat("es-AR", {
    notation: "compact",
    maximumFractionDigits: value >= 100 ? 0 : 1,
  }).format(value);
}

export function formatDate(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;

  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
  }).format(date);
}

export function formatDateTime(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;

  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
