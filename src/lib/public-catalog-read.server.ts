import "server-only";

import type { Prisma } from "@prisma/client";

import { canEmitPublicCatalogDecision, type PublicCatalogAuthorityDecision, type PublicCatalogAuthorityRecord } from "./public-catalog-authority";
import {
  createServerPublicCatalogAuthorityResolver,
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
  const trustedClock = dependencies.trustedClock ?? (async (transaction: GuardedReadTransaction) => queryPublicCatalogTrustedClock(transaction));
  return async <T,>(callback: (projection: PublicCatalogProjection) => T | Promise<T>) => {
    try {
      const database = dependencies.database ?? await defaultDatabase();
      return await database.$transaction(async (transaction) => {
        await transaction.$executeRaw`SET TRANSACTION READ ONLY`;
        const resolveAuthority = createServerPublicCatalogAuthorityResolver(rawIdentityJson, {
          database: transaction,
          trustedClock: async () => trustedClock(transaction),
        });
        const decision = await resolveAuthority();
        if (!decision) return { available: false };
        const value = await callback(projectionOf(transaction));
        const emissionTime = await trustedClock(transaction);
        return canEmitPublicCatalogDecision(decision, emissionTime)
          ? { available: true, decision, value }
          : { available: false };
      }, { isolationLevel: "RepeatableRead" });
    } catch {
      return { available: false };
    }
  };
}
