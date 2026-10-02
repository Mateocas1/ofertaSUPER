import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { PrismaClient } from "@prisma/client";

import { DEFAULT_STAGING_RETENTION_BATCH_SIZE, DEFAULT_STAGING_RETENTION_DAYS, pruneStagingProducts, stagingRetentionBatchSize, stagingRetentionDays } from "../scripts/pipeline/staging-retention";

// Postgres-backed retention test. It runs the real DELETE against a throwaway
// `os547d-*` container and proves that only stale `staging_product` rows leave
// the database. The container is always removed in `finally`; when Docker is
// not available the test skips instead of failing the suite.

const PASSWORD = "os547d-throwaway";
const FIXED_NOW = new Date("2026-10-02T12:00:00.000Z");
const RETENTION_DAYS = 14;

function dockerAvailable() {
  return spawnSync("docker", ["version", "--format", "{{.Server.Version}}"], { encoding: "utf8", timeout: 20_000 }).status === 0;
}

function docker(args: string[], allowFailure = false) {
  const result = spawnSync("docker", args, { encoding: "utf8", timeout: 120_000 });
  if (!allowFailure && result.status !== 0) {
    throw new Error(`docker ${args.join(" ")} failed (${result.status}): ${result.stderr || result.stdout}`);
  }
  return result;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHostPort(container: string) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const ready = spawnSync("docker", ["exec", container, "pg_isready", "-U", "postgres"], { encoding: "utf8", timeout: 15_000 });
    if (ready.status === 0) {
      const port = docker(["port", container, "5432"]).stdout.trim().split(":").pop();
      if (port) return port;
    }
    await sleep(1_000);
  }
  throw new Error("os547d test container never became ready");
}

async function countRows(prisma: PrismaClient, table: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(`select count(*)::bigint as count from ${table}`);
  return Number(rows[0]?.count ?? 0);
}

test("retention configuration defaults to 14 days and reads bounded env overrides", () => {
  assert.equal(stagingRetentionDays({}), DEFAULT_STAGING_RETENTION_DAYS);
  assert.equal(stagingRetentionDays({ STAGING_RETENTION_DAYS: "30" }), 30);
  for (const invalid of ["0", "-5", "nope", ""]) {
    assert.equal(stagingRetentionDays({ STAGING_RETENTION_DAYS: invalid }), DEFAULT_STAGING_RETENTION_DAYS);
  }
  assert.equal(stagingRetentionBatchSize({}), DEFAULT_STAGING_RETENTION_BATCH_SIZE);
  assert.equal(stagingRetentionBatchSize({ STAGING_RETENTION_BATCH_SIZE: "500" }), 500);
  assert.equal(stagingRetentionBatchSize({ STAGING_RETENTION_BATCH_SIZE: "0" }), DEFAULT_STAGING_RETENTION_BATCH_SIZE);
});

test("staging retention deletes only stale staging rows and never the catalog tables", async (t) => {
  if (!dockerAvailable()) {
    t.skip("docker is not available");
    return;
  }

  const container = `os547d-${randomUUID().slice(0, 8)}`;
  let prisma: PrismaClient | undefined;

  try {
    docker(["run", "-d", "--name", container, "-e", `POSTGRES_PASSWORD=${PASSWORD}`, "-p", "127.0.0.1::5432", "postgres:16-bookworm"]);
    const port = await waitForHostPort(container);
    const url = `postgresql://postgres:${PASSWORD}@127.0.0.1:${port}/postgres`;
    process.env.DIRECT_URL = url;
    prisma = new PrismaClient({ datasourceUrl: url });

    for (const table of ["staging_product (id serial primary key, created_at timestamptz not null)", "products (id serial primary key)", "supermarket_products (id serial primary key)", "price_history (id serial primary key)"]) {
      await prisma.$executeRawUnsafe(`create table ${table}`);
    }

    await prisma.$executeRawUnsafe(`insert into staging_product (created_at) select $1::timestamptz - interval '20 days' from generate_series(1, 5)`, FIXED_NOW);
    await prisma.$executeRawUnsafe(`insert into staging_product (created_at) values ($1::timestamptz - interval '14 days')`, FIXED_NOW);
    await prisma.$executeRawUnsafe(`insert into staging_product (created_at) select $1::timestamptz - interval '1 day' from generate_series(1, 2)`, FIXED_NOW);
    for (const table of ["products", "supermarket_products", "price_history"]) {
      await prisma.$executeRawUnsafe(`insert into ${table} (id) select generate_series(1, 2)`);
    }

    const summary = await pruneStagingProducts({ client: prisma, retentionDays: RETENTION_DAYS, batchSize: 2, now: FIXED_NOW });

    assert.equal(summary.retentionDays, RETENTION_DAYS);
    assert.equal(summary.cutoff, "2026-09-18T12:00:00.000Z");
    assert.equal(summary.deleted, 5);
    assert.equal(summary.batches, 3, "5 rows with a batch size of 2 take three bounded statements");
    assert.equal(summary.exhausted, true, "the last batch came back short, so the backlog is drained");

    assert.equal(await countRows(prisma, "staging_product"), 3, "the boundary row and the two recent rows stay");
    for (const table of ["products", "supermarket_products", "price_history"]) {
      assert.equal(await countRows(prisma, table), 2, `${table} must not be touched`);
    }

    const again = await pruneStagingProducts({ client: prisma, retentionDays: RETENTION_DAYS, batchSize: 2, now: FIXED_NOW });
    assert.equal(again.deleted, 0);
    assert.equal(again.batches, 1);
    assert.equal(again.exhausted, true);

    const capped = await pruneStagingProducts({
      client: {
        $executeRaw: async (query) => prisma!.$executeRaw(query),
      },
      retentionDays: 0,
      batchSize: 2,
      maxBatches: 1,
      now: FIXED_NOW,
    });
    assert.equal(capped.deleted, 2, "a zero-day window reaches the two recent rows");
    assert.equal(capped.batches, 1, "maxBatches stops the loop after the first statement");
    assert.equal(capped.exhausted, false, "a full batch with a spent budget is not drained");
    assert.equal(await countRows(prisma, "staging_product"), 1, "only the boundary row survives the zero-day window");
  } finally {
    await prisma?.$disconnect().catch(() => undefined);
    docker(["rm", "-f", container], true);
  }
});
