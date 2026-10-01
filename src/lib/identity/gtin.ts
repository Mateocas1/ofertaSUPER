const SUPPORTED_GTIN_LENGTHS = new Set([8, 12, 13, 14]);
const CANONICAL_GTIN_LENGTH = 14;

function hasValidCheckDigit(digits: number[]) {
  const body = digits.slice(0, -1);
  const sum = body.reduce(
    (total, digit, index) => total + digit * ((body.length - index) % 2 === 0 ? 1 : 3),
    0,
  );
  return (10 - (sum % 10)) % 10 === digits.at(-1);
}

/**
 * Product identity: validates an EAN-8, UPC-12, EAN-13 or GTIN-14 checksum and returns the
 * canonical GTIN-14 (zero-left-padded), so every form of the same item shares one key.
 * Zero padding never changes the check digit. Returns null for anything that is not a GTIN.
 */
export function normalizeGtin(value: string | null | undefined): string | null {
  const normalized = value?.replace(/[ -]/g, "") ?? "";
  if (!SUPPORTED_GTIN_LENGTHS.has(normalized.length) || !/^\d+$/.test(normalized)) {
    return null;
  }

  return hasValidCheckDigit([...normalized].map(Number))
    ? normalized.padStart(CANONICAL_GTIN_LENGTH, "0")
    : null;
}

/**
 * Forms to query a source with, most likely first. Sources publish the short form (EAN-13 for
 * retail items, EAN-8 for small ones, 12 or 13 digits for UPC items), never the padded key.
 */
export function gtinLookupForms(value: string | null | undefined): string[] {
  const canonical = normalizeGtin(value);
  if (!canonical) return [];
  if (canonical.startsWith("000000")) return [canonical.slice(6), canonical.slice(1)];
  if (canonical.startsWith("00")) return [canonical.slice(1), canonical.slice(2)];
  if (canonical.startsWith("0")) return [canonical.slice(1)];
  return [canonical];
}
