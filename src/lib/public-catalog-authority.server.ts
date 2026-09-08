import "server-only";

import {
  parsePublicCatalogServingIdentity,
  resolvePublicCatalogAuthority,
  type PublicCatalogAuthorityFingerprint,
  type PublicCatalogAuthorityRecord,
} from "./public-catalog-authority";

type PublicationQuery = {
  where: { id: string };
  select: {
    id: true;
    target: true;
    state: true;
    verified_at: true;
    promotion_id: true;
    promotion: {
      select: {
        id: true;
        state: true;
        deployment_id: true;
        commit_sha: true;
        candidate_digest: true;
        expires_at: true;
      };
    };
  };
};

type AuthorityDatabase = {
  productionReadinessPublication: {
    findUnique(query: PublicationQuery): Promise<PublicCatalogAuthorityRecord | null>;
  };
};

type ServerAuthorityDependencies = {
  database?: AuthorityDatabase;
  now?: () => Date;
};

const authoritySelection = {
  id: true,
  target: true,
  state: true,
  verified_at: true,
  promotion_id: true,
  promotion: {
    select: {
      id: true,
      state: true,
      deployment_id: true,
      commit_sha: true,
      candidate_digest: true,
      expires_at: true,
    },
  },
} as const;

function parseFactoryIdentity(rawIdentityJson: unknown) {
  if (typeof rawIdentityJson !== "string") return null;
  try {
    return parsePublicCatalogServingIdentity(JSON.parse(rawIdentityJson));
  } catch {
    return null;
  }
}

async function loadPublication(
  publicationId: string,
  database?: AuthorityDatabase,
): Promise<PublicCatalogAuthorityRecord | null> {
  const client = database ?? (await import("@/lib/db")).db;
  return client.productionReadinessPublication.findUnique({
    where: { id: publicationId },
    select: authoritySelection,
  });
}

export function createServerPublicCatalogAuthorityResolver(
  rawIdentityJson: unknown,
  dependencies: ServerAuthorityDependencies = {},
): () => Promise<PublicCatalogAuthorityFingerprint | null> {
  const identity = parseFactoryIdentity(rawIdentityJson);
  if (!identity) return async () => null;

  const now = dependencies.now ?? (() => new Date());
  return async () => {
    let currentTime: Date;
    try {
      currentTime = now();
    } catch {
      return null;
    }
    return resolvePublicCatalogAuthority(
      identity,
      (publicationId) => loadPublication(publicationId, dependencies.database),
      currentTime,
    );
  };
}
