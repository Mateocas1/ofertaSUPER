import assert from "node:assert/strict";
import { after, test } from "node:test";

import { PrismaClient } from "@prisma/client";

import { createPublicCatalogDecisionLeaseStore } from "../src/lib/public-catalog-decision-lease";
import { createPublicCatalogGuardedRead } from "../src/lib/public-catalog-read.server";

const url = process.env.PUBLIC_CATALOG_GUARDED_READ_POSTGRES_URL;
const identity = process.env.PUBLIC_CATALOG_SERVING_IDENTITY_JSON;
const enabled = Boolean(url && identity);
let database: PrismaClient | undefined;
let writer: PrismaClient | undefined;

if (enabled) {
  database = new PrismaClient({ datasources: { db: { url } } });
  writer = new PrismaClient({ datasources: { db: { url } } });
}
after(async () => {
  await Promise.all([database?.$disconnect(), writer?.$disconnect()]);
});

function guarded(clock?: (calls: number) => Date) {
  let calls = 0;
  return createPublicCatalogGuardedRead(identity, {
    database: database as never,
    trustedClock: async () => clock ? clock(calls++) : new Date(),
  });
}

test("uses the real Prisma repeatable-read snapshot for serving detail, history, count, and ranking", { skip: !enabled }, async () => {
  const result = await guarded()(async (projection) => ({
    detail: await projection.servingProduct.findUnique({ where: { ean: "7790000000001" } }),
    history: await projection.servingHistory.findMany({ where: { product_ean: "7790000000001" } }),
    count: await projection.servingOffer.count({ where: { product_ean: "7790000000001" } }),
    ranking: await projection.servingOffer.findMany({
      where: { product_ean: "7790000000001" }, orderBy: { price: "asc" }, select: { supermarket_id: true, price: true },
    }),
  }));
  assert.equal(result.available, true);
  if (!result.available) return;
  assert.equal(result.value.detail?.name, "Snapshot product");
  assert.equal(result.value.history.length, 1);
  assert.equal(result.value.count, 2);
  assert.deepEqual(result.value.ranking.map((offer) => offer.supermarket_id), [1, 2]);
});

test("keeps a legitimate missing serving product available", { skip: !enabled }, async () => {
  const result = await guarded()(async ({ servingProduct }) => servingProduct.findUnique({ where: { ean: "0000000000000" } }));
  assert.deepEqual(result.available ? result.value : undefined, null);
  assert.equal(result.available, true);
});

test("fails closed without baseline authority evidence before invoking the projection", { skip: !enabled }, async () => {
  let invoked = false;
  await writer!.$executeRawUnsafe("ALTER TABLE public.authority_lifecycle_outcomes DISABLE TRIGGER authority_lifecycle_outcomes_immutable");
  await writer!.$executeRawUnsafe("UPDATE public.authority_lifecycle_outcomes SET proof = '{}'::jsonb WHERE operation_id = 'authority'");
  await writer!.$executeRawUnsafe("ALTER TABLE public.authority_lifecycle_outcomes ENABLE TRIGGER authority_lifecycle_outcomes_immutable");
  const result = await guarded()(async () => { invoked = true; return "unexpected"; });
  assert.deepEqual(result, { available: false });
  assert.equal(invoked, false);
});

test("hides a concurrent committed serving projection change from every read in its snapshot", { skip: !enabled }, async () => {
  // Restore the reused U11b4 authority proof; no commercial source table is read.
  await writer!.$executeRawUnsafe("ALTER TABLE public.authority_lifecycle_outcomes DISABLE TRIGGER authority_lifecycle_outcomes_immutable");
  await writer!.$executeRawUnsafe(`UPDATE public.authority_lifecycle_outcomes SET proof = jsonb_build_object('adoption', jsonb_build_object(
    'incarnation','00000000-0000-4000-8000-000000000001','generation','0',
    'lineage','sha256:${"c".repeat(64)}','policyDigest','sha256:${"a".repeat(64)}',
    'buildDigest','sha256:${"b".repeat(64)}','healthVersion','0')) WHERE operation_id = 'authority'`);
  await writer!.$executeRawUnsafe("ALTER TABLE public.authority_lifecycle_outcomes ENABLE TRIGGER authority_lifecycle_outcomes_immutable");
  const result = await guarded()(async (projection) => {
    const before = await projection.servingProduct.findUnique({ where: { ean: "7790000000001" } });
    await writer!.$executeRawUnsafe("UPDATE public.serving_products SET name = 'Snapshot product g1', last_operation_id = 'g1' WHERE ean = '7790000000001'");
    const [detail, history, count, ranking] = await Promise.all([
      projection.servingProduct.findUnique({ where: { ean: "7790000000001" } }),
      projection.servingHistory.findMany({ where: { product_ean: "7790000000001" } }),
      projection.servingOffer.count({ where: { product_ean: "7790000000001" } }),
      projection.servingOffer.findMany({ where: { product_ean: "7790000000001" }, orderBy: { price: "asc" } }),
    ]);
    return { before, detail, history, count, ranking };
  });
  assert.equal(result.available, true);
  if (!result.available) return;
  assert.equal(result.value.before?.name, "Snapshot product");
  assert.equal(result.value.detail?.name, "Snapshot product");
  assert.equal(result.value.history.length, 1);
  assert.equal(result.value.count, 2);
  assert.equal(result.value.ranking.length, 2);
  const next = await guarded()(async ({ servingProduct }) => servingProduct.findUnique({ where: { ean: "7790000000001" } }));
  assert.equal(next.available && next.value?.name, "Snapshot product g1");
});

test("does not install a lease when the authoritative deadline passes during its callback", { skip: !enabled }, async () => {
  const leases = createPublicCatalogDecisionLeaseStore();
  const started = new Date();
  let calls = 0;
  const result = await createPublicCatalogGuardedRead(identity, {
    database: database as never,
    leases,
    trustedClock: async () => new Date(started.getTime() + (calls++ === 0 ? 0 : 31_000)),
  })(async ({ servingProduct }) => servingProduct.findUnique({ where: { ean: "7790000000001" } }));
  assert.deepEqual(result, { available: false });
  assert.equal(leases.get(JSON.parse(identity!), {} as never, started), null);
});
