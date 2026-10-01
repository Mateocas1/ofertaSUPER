export type PublicCatalogUnavailable = {
  error: "Catalog temporarily unavailable";
  dataSource: "unavailable";
  degraded: false;
  verifiedAt: null;
};

export type PublicCatalogProvenance = {
  dataSource: "database";
  degraded: boolean;
  verifiedAt: string;
  latestCheckedAt: string | null;
};

export type PublicCatalogData<T> = T & PublicCatalogProvenance;

export class PublicCatalogUnavailableError extends Error {}

export function publicCatalogUnavailable(): PublicCatalogUnavailable {
  return {
    error: "Catalog temporarily unavailable",
    dataSource: "unavailable",
    degraded: false,
    verifiedAt: null,
  };
}

export function getPublicLatestCheckedAt(value: unknown): string | null {
  if (!value || typeof value !== "object" || !("items" in value) || !Array.isArray(value.items)) {
    return null;
  }

  return value.items
    .map((item) =>
      item && typeof item === "object" && "latestCheckedAt" in item && typeof item.latestCheckedAt === "string"
        ? item.latestCheckedAt
        : null,
    )
    .filter((checkedAt): checkedAt is string => checkedAt !== null)
    .sort((left, right) => right.localeCompare(left))[0] ?? null;
}
