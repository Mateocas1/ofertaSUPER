const SUPPORTED_GTIN_LENGTHS = new Set([8, 12, 13, 14]);

export function normalizeGtin(value: string | null | undefined): string | null {
  const normalized = value?.replace(/[ -]/g, "") ?? "";
  if (!SUPPORTED_GTIN_LENGTHS.has(normalized.length) || !/^\d+$/.test(normalized)) {
    return null;
  }

  const digits = [...normalized].map(Number);
  const checkDigit = digits.pop();
  const sum = digits.reduce(
    (total, digit, index) => total + digit * ((digits.length - index) % 2 === 0 ? 1 : 3),
    0,
  );

  return (10 - (sum % 10)) % 10 === checkDigit ? normalized : null;
}
