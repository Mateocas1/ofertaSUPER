type ProductCandidateReadInput = {
  page?: number;
  limit?: number;
};

export const MIN_PRODUCT_CANDIDATE_READ_LIMIT = 200;
export const MAX_PRODUCT_CANDIDATE_READ_LIMIT = 5000;
const PRODUCT_CANDIDATE_OVERSAMPLE_FACTOR = 4;
const SOURCE_PRODUCT_CANDIDATE_MULTIPLIER = 6;

function normalizePositiveInteger(value: number | undefined, fallback: number) {
  return Number.isInteger(value) && value !== undefined && value > 0 ? value : fallback;
}

export function calculateProductCandidateReadLimit(input: ProductCandidateReadInput) {
  const page = normalizePositiveInteger(input.page, 1);
  const limit = normalizePositiveInteger(input.limit, 24);
  const requested = page * limit * PRODUCT_CANDIDATE_OVERSAMPLE_FACTOR;

  return Math.min(
    MAX_PRODUCT_CANDIDATE_READ_LIMIT,
    Math.max(MIN_PRODUCT_CANDIDATE_READ_LIMIT, requested),
  );
}

export function calculateSourceProductCandidateReadLimit(input: ProductCandidateReadInput) {
  return Math.min(
    MAX_PRODUCT_CANDIDATE_READ_LIMIT,
    calculateProductCandidateReadLimit(input) * SOURCE_PRODUCT_CANDIDATE_MULTIPLIER,
  );
}
