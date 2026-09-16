type PublicationState = "historical" | "promoted" | "revoked";

type DependencyState = {
  cache: Map<string, string>;
  publication: PublicationState;
  verifiedAt: Date | null;
  expiresAt: Date | null;
  authorityReads: number;
  cacheReads: number;
  cacheWrites: number;
  catalogReads: number;
  admissionKeys: string[];
};

const state: DependencyState = {
  cache: new Map<string, string>(),
  publication: "revoked",
  verifiedAt: null,
  expiresAt: null,
  authorityReads: 0,
  cacheReads: 0,
  cacheWrites: 0,
  catalogReads: 0,
  admissionKeys: [],
};

function servingIdentity() {
  const rawIdentity = process.env.PUBLIC_CATALOG_SERVING_IDENTITY_JSON;
  if (!rawIdentity) throw new Error("test authority was queried without a serving identity");
  return JSON.parse(rawIdentity) as {
    publicationId: string;
    target: "production";
    deploymentId: string;
    commitSha: string;
    candidateDigest: string;
  };
}

export function resetPublicCatalogDependencies() {
  state.cache.clear();
  state.publication = "revoked";
  state.verifiedAt = null;
  state.expiresAt = null;
  state.authorityReads = 0;
  state.cacheReads = 0;
  state.cacheWrites = 0;
  state.catalogReads = 0;
  state.admissionKeys = [];
}

export function promotePublication() {
  state.publication = "promoted";
  state.verifiedAt = new Date(Date.now() - 60 * 60 * 1000);
  state.expiresAt = new Date(Date.now() + 60 * 60 * 1000);
}

export function useHistoricalPublication() {
  state.publication = "historical";
  state.verifiedAt = new Date(Date.now() - 25 * 60 * 60 * 1000);
  state.expiresAt = new Date(Date.now() + 60 * 60 * 1000);
}

export function revokePublication() {
  state.publication = "revoked";
}

export function dependencyObservations() {
  return {
    authorityReads: state.authorityReads,
    cacheReads: state.cacheReads,
    cacheWrites: state.cacheWrites,
    catalogReads: state.catalogReads,
    cachedEntries: state.cache.size,
  };
}

export function admissionObservations() {
  return [...state.admissionKeys];
}

export const db = {
  productionReadinessPublication: {
    async findUnique(query: { where: { id: string } }) {
      state.authorityReads += 1;
      const identity = servingIdentity();
      if (query.where.id !== identity.publicationId || state.publication === "revoked") return null;

      const now = Date.now();
      return {
        id: identity.publicationId,
        target: identity.target,
        state: "PROMOTED",
        verified_at: state.verifiedAt ?? new Date(now),
        promotion_id: "promotion-1",
        promotion: {
          id: "promotion-1",
          state: "PROMOTED",
          deployment_id: identity.deploymentId,
          commit_sha: identity.commitSha,
          candidate_digest: identity.candidateDigest,
          expires_at: state.expiresAt ?? new Date(now),
        },
      };
    },
  },
};

export async function getCachedJson<T>(key: string): Promise<T | null> {
  state.cacheReads += 1;
  const value = state.cache.get(key);
  return value === undefined ? null : JSON.parse(value) as T;
}

export async function setCachedJson<T>(key: string, value: T) {
  state.cacheWrites += 1;
  state.cache.set(key, JSON.stringify(value));
}

export async function getSearchSuggestions(query: string, limit: number) {
  state.catalogReads += 1;
  return [{ ean: "7790000000001", name: `Cached ${query}`, limit }];
}

export async function getProductDetail(ean: string) {
  state.catalogReads += 1;
  return { ean, name: "Cached product" };
}

export function selectCacheProvider(env: Record<string, string | undefined>) {
  return env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN ? "upstash" : "none";
}

const rateState = (success: boolean, reason?: string) => ({
  success, limit: 60, remaining: success ? 59 : 0, reset: Date.now() + 60_000, pending: Promise.resolve(), reason,
});

export class Redis { constructor(_options: unknown) {} }
export class Ratelimit {
  static slidingWindow() { return {}; }
  constructor(_options: unknown) {}
  async limit(key: string) {
    state.admissionKeys.push(key);
    const scenario = process.env.TEST_ADMISSION_SCENARIO ?? "admitted";
    if (scenario === "error") throw new Error("backend unavailable");
    if (scenario === "timeout") return rateState(true, "timeout");
    return rateState(scenario !== "global" && !(scenario === "client" && key.includes(":client:")));
  }
}
