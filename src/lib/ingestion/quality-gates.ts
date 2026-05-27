type QualityGateSeverity = "BLOCK" | "WARN";

export type StageValidationCandidate = {
  ean: string;
  name: string;
  brand: string | null;
  category: string | null;
  imageUrl: string | null;
  images: string[];
  price: number | null;
};

export type StageValidationResult = {
  qualityScore: number;
  qualityFlags: string[];
  status: "PENDING" | "REJECTED";
};

type QualityGate = {
  id: string;
  severity: QualityGateSeverity;
  passes: (candidate: StageValidationCandidate, context: { historicalAverage: number | null }) => boolean;
};

const QUALITY_GATES: QualityGate[] = [
  {
    id: "valid_ean",
    severity: "BLOCK",
    passes: (candidate) => /^\d{8,14}$/.test(candidate.ean),
  },
  {
    id: "has_name",
    severity: "BLOCK",
    passes: (candidate) => candidate.name.trim().length > 0,
  },
  {
    id: "price_positive",
    severity: "BLOCK",
    passes: (candidate) => candidate.price === null || candidate.price > 0,
  },
  {
    id: "price_sane",
    severity: "BLOCK",
    passes: (candidate) => candidate.price === null || candidate.price < 1_500_000,
  },
  {
    id: "price_no_spike",
    severity: "BLOCK",
    passes: (candidate, context) =>
      candidate.price === null ||
      context.historicalAverage === null ||
      context.historicalAverage <= 0 ||
      candidate.price <= context.historicalAverage * 5,
  },
  {
    id: "has_brand",
    severity: "WARN",
    passes: (candidate) => Boolean(candidate.brand?.trim()),
  },
  {
    id: "has_image",
    severity: "WARN",
    passes: (candidate) => Boolean(candidate.imageUrl || candidate.images.length > 0),
  },
  {
    id: "has_category",
    severity: "WARN",
    passes: (candidate) => Boolean(candidate.category?.trim()),
  },
];

export function evaluateStageCandidate(
  candidate: StageValidationCandidate,
  context: { historicalAverage: number | null },
): StageValidationResult {
  const failedFlags: string[] = [];
  let warnCount = 0;
  let passedWarnCount = 0;
  let hasBlockingFailure = false;

  for (const gate of QUALITY_GATES) {
    const passed = gate.passes(candidate, context);

    if (gate.severity === "WARN") {
      warnCount += 1;
      if (passed) {
        passedWarnCount += 1;
      }
    }

    if (!passed) {
      failedFlags.push(gate.id);
      if (gate.severity === "BLOCK") {
        hasBlockingFailure = true;
      }
    }
  }

  return {
    qualityScore: warnCount === 0 ? 1 : passedWarnCount / warnCount,
    qualityFlags: failedFlags,
    status: hasBlockingFailure ? "REJECTED" : "PENDING",
  };
}