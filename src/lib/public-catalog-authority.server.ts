import "server-only";

import {
  parsePublicCatalogServingIdentity,
  resolvePublicCatalogAuthority,
  type PublicCatalogAuthorityDecision,
  type PublicCatalogAuthorityRecord,
  type PublicCatalogReaderEligibility,
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
  $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
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

async function loadReaderEligibility(
  publicationId: string,
  deploymentId: string,
  now: Date,
  database?: AuthorityDatabase,
): Promise<PublicCatalogReaderEligibility | null> {
  const client = database ?? (await import("@/lib/db")).db;
  try {
    const rows = await client.$queryRaw<PublicCatalogReaderEligibility[]>`
      SELECT
        reader.reader_id AS "readerId",
        reader.generation::text AS "generation",
        reader.lineage,
        reader.policy_digest AS "policyDigest",
        reader.health_version::text AS "healthVersion",
        reader.build_digest AS "buildDigest",
        reader.expires_at AS "expiresAt"
      FROM public.reader_generation_adoptions reader
      JOIN public.existing_live_adoptions publisher
        ON publisher.id = reader.existing_live_adoption_id
      JOIN public.governed_catalogs catalog ON catalog.id = 'catalog'
      WHERE reader.reader_id = ${deploymentId}
        AND reader.surface = 'catalog'
        AND reader.expires_at > ${now}
        AND publisher.publication_id = ${publicationId}
        AND reader.generation = publisher.generation
        AND reader.lineage = publisher.lineage
        AND reader.policy_digest = publisher.policy_digest
        AND reader.health_version = publisher.health_version
        AND reader.build_digest = publisher.build_digest
        AND catalog.state = 'LIVE'
        AND catalog.governed_generation = reader.generation
        AND catalog.authority_adoption->>'generation' = reader.generation::text
        AND catalog.authority_adoption->>'lineage' = reader.lineage
        AND catalog.authority_adoption->>'policyDigest' = reader.policy_digest
        AND catalog.authority_adoption->>'healthVersion' = reader.health_version::text
        AND catalog.authority_adoption->>'buildDigest' = reader.build_digest
        AND NOT EXISTS (
          SELECT 1 FROM public.authority_revoke_outcomes revoked
          WHERE revoked.authority_operation_id = publisher.authority_operation_id
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.catalog_restriction_facts fact
          LEFT JOIN public.catalog_restriction_surfaces surface ON surface.fact = fact.fact
          WHERE surface.fact IS NULL OR surface.surface = 'catalog'
        )
      LIMIT 1
    `;
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

export function createServerPublicCatalogAuthorityResolver(
  rawIdentityJson: unknown,
  dependencies: ServerAuthorityDependencies = {},
): () => Promise<PublicCatalogAuthorityDecision | null> {
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
      async (publicationId) => {
        const publication = await loadPublication(publicationId, dependencies.database);
        if (!publication) return null;
        return {
          ...publication,
          readerEligibility: await loadReaderEligibility(
            publicationId,
            identity.deploymentId,
            currentTime,
            dependencies.database,
          ),
        };
      },
      currentTime,
    );
  };
}
