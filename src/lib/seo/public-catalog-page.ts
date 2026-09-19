import type { PublicCatalogData, PublicCatalogUnavailable } from "@/lib/public-catalog-api";

export type PublicCatalogPageResult<T extends object, Shell> =
  | {
    availability: "eligible";
    shell: Shell;
    catalog: PublicCatalogData<T>;
  }
  | {
    availability: "unavailable";
    shell: Shell;
  };

/**
 * Keeps static page chrome independent from guarded catalog data. An unavailable
 * result intentionally has no catalog property, preventing commercial fields
 * from crossing the guarded boundary into a page render.
 */
export function createPublicCatalogPageResult<T extends object, Shell>(
  shell: Shell,
  result: PublicCatalogData<T> | PublicCatalogUnavailable,
): PublicCatalogPageResult<T, Shell> {
  if (result.dataSource === "unavailable") {
    return { availability: "unavailable", shell };
  }

  return { availability: "eligible", shell, catalog: result };
}
