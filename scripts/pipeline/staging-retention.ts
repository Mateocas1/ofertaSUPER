import { Prisma } from "@prisma/client";

// Staging retention (#547). `staging_product` is pipeline bookkeeping that was
// only ever pruned by the removed `cleanup:staging` script, so it grew without
// bound. At the end of a successful refresh we delete the rows older than the
// retention window in id-ordered batches, and only from `staging_product`:
// `price_history`, `products` and `supermarket_products` are never touched.

export const DEFAULT_STAGING_RETENTION_DAYS = 14;
export const DEFAULT_STAGING_RETENTION_BATCH_SIZE = 2_000;
// Bounds one refresh: even a very large backlog is pruned across runs instead
// of holding the daily job open.
export const MAX_STAGING_RETENTION_BATCHES = 50;

export type StagingRetentionClient = {
  $executeRaw: (query: Prisma.Sql) => Promise<number>;
};

export type StagingRetentionSummary = {
  cutoff: string;
  retentionDays: number;
  deleted: number;
  batches: number;
  exhausted: boolean;
};

function readPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : fallback;
}

export function stagingRetentionDays(env: Record<string, string | undefined> = process.env) {
  return readPositiveInteger(env.STAGING_RETENTION_DAYS, DEFAULT_STAGING_RETENTION_DAYS);
}

export function stagingRetentionBatchSize(env: Record<string, string | undefined> = process.env) {
  return readPositiveInteger(env.STAGING_RETENTION_BATCH_SIZE, DEFAULT_STAGING_RETENTION_BATCH_SIZE);
}

export async function pruneStagingProducts({
  client,
  retentionDays = stagingRetentionDays(),
  batchSize = stagingRetentionBatchSize(),
  maxBatches = MAX_STAGING_RETENTION_BATCHES,
  now = new Date(),
}: {
  client: StagingRetentionClient;
  retentionDays?: number;
  batchSize?: number;
  maxBatches?: number;
  now?: Date;
}): Promise<StagingRetentionSummary> {
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  let deleted = 0;
  let batches = 0;
  let exhausted = false;

  while (batches < maxBatches) {
    // `id in (select ... limit n)` keeps every statement bounded; the strict
    // `created_at < cutoff` leaves the boundary row in place.
    const removed = await client.$executeRaw(Prisma.sql`
      delete from staging_product
      where id in (
        select id from staging_product where created_at < ${cutoff} order by id limit ${batchSize}
      )`);
    deleted += removed;
    batches += 1;
    if (removed < batchSize) {
      exhausted = true;
      break;
    }
  }

  return { cutoff: cutoff.toISOString(), retentionDays, deleted, batches, exhausted };
}
