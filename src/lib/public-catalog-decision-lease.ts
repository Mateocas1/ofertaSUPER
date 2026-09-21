import { canEmitPublicCatalogDecision, parsePublicCatalogServingIdentity, type PublicCatalogAuthorityDecision, type PublicCatalogServingIdentity } from "./public-catalog-authority";

export type PublicCatalogDecisionLeaseStore = {
  install(identity: unknown, decision: PublicCatalogAuthorityDecision, now: Date): boolean;
  get(identity: unknown, decision: PublicCatalogAuthorityDecision, now: Date): PublicCatalogAuthorityDecision | null;
  evict(identity: unknown): void;
};

function identityKey(identity: PublicCatalogServingIdentity): string {
  return JSON.stringify([identity.version, identity.target, identity.publicationId, identity.deploymentId, identity.commitSha, identity.candidateDigest]);
}

function decisionKey(identity: PublicCatalogServingIdentity, decision: PublicCatalogAuthorityDecision): string {
  return JSON.stringify([identityKey(identity), decision.generation, decision.lineage, decision.policyDigest, decision.healthVersion, decision.buildDigest]);
}

function copy(decision: PublicCatalogAuthorityDecision): PublicCatalogAuthorityDecision {
  return Object.freeze({ ...decision });
}

export function createPublicCatalogDecisionLeaseStore(): PublicCatalogDecisionLeaseStore {
  const leases = new Map<string, PublicCatalogAuthorityDecision>();
  return {
    install(input, decision, now) {
      const identity = parsePublicCatalogServingIdentity(input);
      if (!identity || !canEmitPublicCatalogDecision(decision, now)) return false;
      const key = decisionKey(identity, decision);
      const existing = leases.get(key);
      if (!existing || !canEmitPublicCatalogDecision(existing, now)) leases.set(key, copy(decision));
      return true;
    },
    get(input, decision, now) {
      const identity = parsePublicCatalogServingIdentity(input);
      if (!identity) return null;
      const key = decisionKey(identity, decision);
      const lease = leases.get(key);
      if (!lease) return null;
      if (!canEmitPublicCatalogDecision(lease, now)) {
        leases.delete(key);
        return null;
      }
      return copy(lease);
    },
    evict(input) {
      const identity = parsePublicCatalogServingIdentity(input);
      if (!identity) return;
      const prefix = `[${JSON.stringify(identityKey(identity))},`;
      for (const key of leases.keys()) if (key.startsWith(prefix)) leases.delete(key);
    },
  };
}

export const publicCatalogDecisionLeases = createPublicCatalogDecisionLeaseStore();
