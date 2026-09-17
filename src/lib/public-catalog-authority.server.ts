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

export type AuthorityDatabase = {
  productionReadinessPublication: {
    findUnique(query: PublicationQuery): Promise<PublicCatalogAuthorityRecord | null>;
  };
  $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
};

type TrustedClock = (database: AuthorityDatabase) => Promise<Date>;

export type ServerAuthorityDependencies = {
  database?: AuthorityDatabase;
  trustedClock?: TrustedClock;
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

function validDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

export async function queryPublicCatalogTrustedClock(database: AuthorityDatabase): Promise<Date> {
  const rows = await database.$queryRaw<Array<{ now: unknown }>>`
    SELECT pg_catalog.clock_timestamp() AS "now"
  `;
  const now = rows[0]?.now;
  if (!validDate(now)) throw new Error("trusted database clock unavailable");
  return now;
}

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
        AND (
          (
            publisher.generation = 0
            AND publisher.generation_record_id IS NULL
            AND EXISTS (
              SELECT 1
              FROM public.authority_lifecycle_outcomes authority
              JOIN public.production_readiness_publications publication ON publication.id = authority.publication_id
              JOIN public.production_readiness_promotions promotion ON promotion.id = publication.promotion_id
              JOIN public.authority_candidates candidate ON candidate.manifest_digest = promotion.candidate_digest
              JOIN public.baseline_manifests baseline ON baseline.id = candidate.baseline_manifest_id
              JOIN public.refresh_policies policy ON policy.id = candidate.policy_id
              WHERE authority.operation_id = publisher.authority_operation_id
                AND authority.publication_id = publisher.publication_id
                AND publication.state = 'PROMOTED'
                AND promotion.state = 'PROMOTED'
                AND candidate.deployment_id = promotion.deployment_id
                AND candidate.full_sha = promotion.commit_sha
                AND candidate.target = publication.target
                AND policy.digest = publisher.policy_digest
                AND authority.final_checked_at < authority.expires_at
                AND baseline.root_digest = publisher.lineage
                AND authority.proof->'adoption'->>'generation' = publisher.generation::text
                AND authority.proof->'adoption'->>'lineage' = baseline.root_digest
                AND authority.proof->'adoption'->>'policyDigest' = publisher.policy_digest
                AND authority.proof->'adoption'->>'healthVersion' = publisher.health_version::text
                AND authority.proof->'adoption'->>'buildDigest' = publisher.build_digest
                AND authority.proof->'adoption'->>'incarnation' = publisher.incarnation::text
            )
          )
          OR (
            publisher.generation > 0
            AND EXISTS (
              SELECT 1
              FROM public.governed_generation_records record
              JOIN public.sealed_generation_manifests manifest ON manifest.id = record.manifest_id
              JOIN public.generation_promotion_operations operation ON operation.generation_record_id = record.id
              WHERE record.id = publisher.generation_record_id
                AND record.generation = publisher.generation
                AND record.result_lineage = publisher.lineage
                AND record.policy_digest = publisher.policy_digest
                AND record.health_version = publisher.health_version
                AND record.build_digest = publisher.build_digest
                AND manifest.publication_id = publisher.publication_id
                AND operation.outcome->>'generation' = publisher.generation::text
                AND operation.outcome->>'lineage' = publisher.lineage
                AND publisher.expires_at <= (operation.outcome->>'expiresAt')::timestamptz
                AND (operation.outcome->>'expiresAt')::timestamptz > ${now}
            )
          )
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

  const trustedClock = dependencies.trustedClock ?? queryPublicCatalogTrustedClock;
  return async () => {
    try {
      const database = dependencies.database ?? (await import("@/lib/db")).db;
      const currentTime = await trustedClock(database);
      return resolvePublicCatalogAuthority(
        identity,
        async (publicationId) => {
          const publication = await loadPublication(publicationId, database);
          if (!publication) return null;
          return {
            ...publication,
            readerEligibility: await loadReaderEligibility(
              publicationId,
              identity.deploymentId,
              currentTime,
              database,
            ),
          };
        },
        currentTime,
      );
    } catch {
      return null;
    }
  };
}
