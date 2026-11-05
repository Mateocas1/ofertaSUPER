import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatCalendarDate,
  formatClock,
  formatDate,
  formatDateTime,
  formatDateWithYear,
  formatDiscountPercent,
  formatPercent,
  formatPercentage,
  formatSignedPercent,
  pluralize,
} from "../src/lib/format";

describe("es-AR number formatting", () => {
  it("formats signed movements with an es-AR decimal comma and a real minus sign", () => {
    assert.equal(formatSignedPercent(2.54), "+2,5%");
    assert.equal(formatSignedPercent(-59.89), "−59,9%");
    assert.equal(formatSignedPercent(0), "0%");
    assert.equal(formatSignedPercent(-0.01), "0%");
    assert.equal(formatSignedPercent(null), "-");
    assert.equal(formatPercent(1.25, 2), "+1,25%");
  });

  it("never renders a discount with a plus sign", () => {
    assert.equal(formatDiscountPercent(46), "−46%");
    assert.equal(formatDiscountPercent(-46), "−46%");
    assert.equal(formatDiscountPercent(12.5, 1), "−12,5%");
    assert.equal(formatDiscountPercent(undefined), "-");
  });

  it("formats unsigned shares in es-AR", () => {
    assert.equal(formatPercentage(45.25), "45,3%");
    assert.equal(formatPercentage(14, 0), "14%");
  });

  it("pluralizes counts", () => {
    assert.equal(pluralize(1, "supermercado"), "1 supermercado");
    assert.equal(pluralize(3, "supermercado"), "3 supermercados");
    assert.equal(pluralize(0, "baja"), "0 bajas");
    assert.equal(pluralize(2, "promoción", "promociones"), "2 promociones");
  });

  it("formats observation instants on the Buenos Aires calendar and clock", () => {
    // 02:30 UTC on the 5th is still the 4th in Buenos Aires (UTC-3).
    const instant = "2026-11-05T02:30:00Z";
    assert.equal(formatDate(instant), "4 nov");
    assert.equal(formatDateWithYear(instant), "4 nov 2026");
    assert.equal(formatClock(instant), "23:30");
    assert.equal(formatDateTime(instant), "4 nov 2026, 23:30");
    assert.equal(formatDate("not a date"), "fecha desconocida");
  });

  it("never shifts a calendar date by time zone", () => {
    assert.equal(formatCalendarDate("2026-11-04"), "4 nov");
    assert.equal(formatCalendarDate("2026-11-04", { withYear: true }), "4 nov 2026");
  });
});
