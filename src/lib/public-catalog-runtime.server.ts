import "server-only";

import { createServerPublicCatalogAuthorityResolver } from "./public-catalog-authority.server";

export const resolvePublicCatalogRuntimeAuthority = createServerPublicCatalogAuthorityResolver(
  process.env.PUBLIC_CATALOG_SERVING_IDENTITY_JSON,
);
