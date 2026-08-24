export const PUBLIC_CATALOG_MAX_AGE_HOURS = 24;

export type PublicCatalogReadiness = {
  status: "fresh" | "degraded" | "unavailable";
  verifiedAt: string | null;
};

type VerificationWatermark = { verified_at: Date | null } | null | undefined;

type ReadinessOptions = { now?: Date; sourceSlaHours?: number | null };

function maxAgeHours(sourceSlaHours: number | null | undefined) {
  return Number.isFinite(sourceSlaHours) && sourceSlaHours && sourceSlaHours > 0
    ? Math.min(sourceSlaHours, PUBLIC_CATALOG_MAX_AGE_HOURS)
    : PUBLIC_CATALOG_MAX_AGE_HOURS;
}

export function classifyPublicCatalogReadiness(
  watermark: VerificationWatermark,
  options: ReadinessOptions = {},
): PublicCatalogReadiness {
  const verifiedAt = watermark?.verified_at;
  if (!verifiedAt || Number.isNaN(verifiedAt.getTime())) {
    return { status: "unavailable", verifiedAt: null };
  }

  const now = (options.now ?? new Date()).getTime();
  if (verifiedAt.getTime() > now) {
    return { status: "unavailable", verifiedAt: null };
  }

  const ageMs = now - verifiedAt.getTime();
  return {
    status: ageMs < maxAgeHours(options.sourceSlaHours) * 60 * 60 * 1000 ? "fresh" : "degraded",
    verifiedAt: verifiedAt.toISOString(),
  };
}
