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

/**
 * Observations are instants. They are shown on the Buenos Aires calendar and
 * clock whatever time zone renders the page (servers run on UTC).
 */
export const AR_TIME_ZONE = "America/Argentina/Buenos_Aires";

const dayMonthFormatter = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", timeZone: AR_TIME_ZONE });
// es-AR renders day+month+year as "4 de nov de 2026"; the bulletin style is
// "4 nov 2026", so the year is formatted on its own and appended.
const yearFormatter = new Intl.DateTimeFormat("es-AR", { year: "numeric", timeZone: AR_TIME_ZONE });
const clockFormatter = new Intl.DateTimeFormat("es-AR", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: AR_TIME_ZONE,
});
// Calendar dates ("2026-11-04") have no instant: format them as-is in UTC so
// no time zone can move them to the previous day.
const calendarDayMonth = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", timeZone: "UTC" });
const calendarYear = new Intl.DateTimeFormat("es-AR", { year: "numeric", timeZone: "UTC" });

const UNKNOWN_DATE = "fecha desconocida";

function toDate(value: string | Date): Date | null {
  const date = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "4 nov" (Buenos Aires). */
export function formatDate(value: string | Date) {
  const date = toDate(value);
  return date ? dayMonthFormatter.format(date) : UNKNOWN_DATE;
}

/** "4 nov 2026" (Buenos Aires). */
export function formatDateWithYear(value: string | Date) {
  const date = toDate(value);
  return date ? `${dayMonthFormatter.format(date)} ${yearFormatter.format(date)}` : UNKNOWN_DATE;
}

/** "15:15" (Buenos Aires, 24 h). */
export function formatClock(value: string | Date) {
  const date = toDate(value);
  return date ? clockFormatter.format(date) : UNKNOWN_DATE;
}

/** "4 nov 2026, 15:15" (Buenos Aires). */
export function formatDateTime(value: string | Date) {
  const date = toDate(value);
  return date ? `${formatDateWithYear(date)}, ${clockFormatter.format(date)}` : UNKNOWN_DATE;
}

/** A calendar date "2026-11-04" as "4 nov" or, with the year, "4 nov 2026". */
export function formatCalendarDate(isoDate: string, options: { withYear?: boolean } = {}) {
  const date = toDate(`${isoDate}T12:00:00Z`);
  if (!date) return UNKNOWN_DATE;
  const dayMonth = calendarDayMonth.format(date);
  return options.withYear ? `${dayMonth} ${calendarYear.format(date)}` : dayMonth;
}
