import "server-only";

import type { Prisma } from "@prisma/client";

import { canEmitPublicCatalogDecision, parsePublicCatalogServingIdentity, type PublicCatalogAuthorityDecision, type PublicCatalogAuthorityRecord } from "./public-catalog-authority";
import { publicCatalogDecisionLeases, type PublicCatalogDecisionLeaseStore } from "./public-catalog-decision-lease";
import {
  createServerPublicCatalogAuthorityOutcomeResolver,
  queryPublicCatalogTrustedClock,
} from "./public-catalog-authority.server";

type PublicationQuery = {
  where: { id: string };
  select: Record<string, unknown>;
};

type AuthorityTransaction = {
  productionReadinessPublication: {
    findUnique(query: PublicationQuery): Promise<PublicCatalogAuthorityRecord | null>;
  };
  $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
};

type ServingDelegate = "servingProduct" | "servingSupermarket" | "servingOffer" |
  "servingHistory" | "servingPromotion" | "servingMembership";
type ServingReadMethod = "findUnique" | "findFirst" | "findMany" | "count" | "aggregate" | "groupBy";
type ReadDelegate<T> = Pick<T, Extract<keyof T, ServingReadMethod>>;
type ServingProjection = {
  [Delegate in ServingDelegate]: ReadDelegate<Prisma.TransactionClient[Delegate]>;
};

type GuardedReadTransaction = AuthorityTransaction & ServingProjection & {
  $executeRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
};

type GuardedReadDatabase = {
  $transaction<T>(
    callback: (transaction: GuardedReadTransaction) => Promise<T>,
    options: { isolationLevel: "RepeatableRead" },
  ): Promise<T>;
};

export type PublicCatalogProjection = Readonly<ServingProjection>;
export type PublicCatalogReadResult<T> =
  | { readonly available: true; readonly decision: PublicCatalogAuthorityDecision; readonly value: T }
  | { readonly available: false };

type GuardedReadDependencies = {
  database?: GuardedReadDatabase;
  trustedClock?: (transaction: GuardedReadTransaction) => Promise<Date>;
  leases?: PublicCatalogDecisionLeaseStore;
};

function projectionOf(transaction: GuardedReadTransaction): PublicCatalogProjection {
  return {
    servingProduct: transaction.servingProduct,
    servingSupermarket: transaction.servingSupermarket,
    servingOffer: transaction.servingOffer,
    servingHistory: transaction.servingHistory,
    servingPromotion: transaction.servingPromotion,
    servingMembership: transaction.servingMembership,
  };
}

async function defaultDatabase(): Promise<GuardedReadDatabase> {
  return (await import("@/lib/db")).db as unknown as GuardedReadDatabase;
}

export function createPublicCatalogGuardedRead(
  rawIdentityJson: unknown,
  dependencies: GuardedReadDependencies = {},
): <T>(callback: (projection: PublicCatalogProjection) => T | Promise<T>) => Promise<PublicCatalogReadResult<T>> {
  const identity = typeof rawIdentityJson === "string" ? (() => { try { return parsePublicCatalogServingIdentity(JSON.parse(rawIdentityJson)); } catch { return null; } })() : null;
  const leases = dependencies.leases ?? publicCatalogDecisionLeases;
  const trustedClock = dependencies.trustedClock ?? (async (transaction: GuardedReadTransaction) => queryPublicCatalogTrustedClock(transaction));
  return async <T,>(callback: (projection: PublicCatalogProjection) => T | Promise<T>) => {
    try {
      const database = dependencies.database ?? await defaultDatabase();
      const result = await database.$transaction(async (transaction) => {
        await transaction.$executeRaw`SET TRANSACTION READ ONLY`;
        const outcome = await createServerPublicCatalogAuthorityOutcomeResolver(rawIdentityJson, {
          database: transaction, trustedClock: async () => trustedClock(transaction),
        })();
        if (outcome.status !== "eligible") return {
          available: false as const, confirmedIneligible: outcome.status === "ineligible",
        };
        const value = await callback(projectionOf(transaction));
        const emissionTime = await trustedClock(transaction);
        return canEmitPublicCatalogDecision(outcome.decision, emissionTime)
          ? { available: true as const, decision: outcome.decision, value, emissionTime }
          : { available: false as const };
      }, { isolationLevel: "RepeatableRead" });
      if (!result.available) {
        if (result.confirmedIneligible && identity) leases.evict(identity);
        return { available: false };
      }
      if (identity) leases.install(identity, result.decision, result.emissionTime);
      return { available: true, decision: result.decision, value: result.value };
    } catch {
      return { available: false };
    }
  };
}
