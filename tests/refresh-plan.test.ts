import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { fetchVtexCategoryTree } from "../src/lib/vtex/category-tree";
import {
  DISCOVERY_CONFIG_PATH,
  parseFrozenPlan,
  refreshBatchId,
  resolveRefreshPlan,
} from "../scripts/pipeline/resolve-refresh-plan";

const CONFIG = {
  schemaVersion: 1,
  maxBatchesPerRun: 6,
  resultsPerBatch: 50,
  departments: { disco: ["Almacén"], carrefour: ["Bebidas"] },
};

function fixture(source: string) {
  return JSON.parse(readFileSync(new URL(`./fixtures/vtex/category-tree-${source}.json`, import.meta.url), "utf8")) as { tree: unknown };
}

function readerWith(config: unknown) {
  return async (path: string) => (path === DISCOVERY_CONFIG_PATH ? JSON.stringify(config) : readFile(path, "utf8"));
}

function treeFetcher(overrides: Record<string, unknown> = {}) {
  return async ({ source }: { source: string; baseUrl: string }) => {
    if (source in overrides) return overrides[source];
    return fixture(source).tree;
  };
}

test("resolveRefreshPlan builds discovered batches from the live category trees", async () => {
  const resolution = await resolveRefreshPlan({
    dependencies: { readFile: readerWith(CONFIG), fetchTree: treeFetcher(), baseUrlFor: () => "https://example.test" },
  });

  assert.equal(resolution.mode, "discovered");
  assert.equal(resolution.reason, null);
  assert.equal(resolution.batches.length, 6);
  assert.deepEqual([...new Set(resolution.batches.map((batch) => batch.source))], ["disco", "carrefour"]);
  assert.deepEqual(resolution.batches.map((batch) => batch.ordinal), [1, 2, 3, 4, 5, 6]);
  for (const batch of resolution.batches) {
    assert.deepEqual(batch.expectedGtins, []);
    assert.equal(batch.count, 50);
    assert.ok(batch.term.length > 0);
  }
  assert.ok(resolution.categoriesConsidered > 0);
  assert.equal(resolution.departmentsMatched, 2);
  assert.equal(resolution.truncated, true);
});

test("resolveRefreshPlan falls back to the frozen plan when a category tree cannot be read", async () => {
  const resolution = await resolveRefreshPlan({
    dependencies: {
      readFile: readerWith(CONFIG),
      fetchTree: async ({ source }) => {
        if (source === "carrefour") throw new Error("VTEX category tree returned 503");
        return fixture(source).tree;
      },
      baseUrlFor: () => "https://example.test",
    },
  });

  assert.equal(resolution.mode, "fallback");
  assert.match(resolution.reason ?? "", /503/);
  assert.ok(resolution.batches.length > 0);
  assert.ok(resolution.batches.every((batch) => batch.expectedGtins.length === batch.count));
  assert.deepEqual(resolution.batches, parseFrozenPlan(JSON.parse(readFileSync("artifacts/cmvp/catalog/expansion-20260920-discovery-25/acquisition-plan-cycle2.json", "utf8"))));
});

test("resolveRefreshPlan falls back for an invalid config, an unsupported source or an empty match", async () => {
  const cases: Array<{ config: unknown; fetchTree?: ReturnType<typeof treeFetcher>; reason: RegExp }> = [
    { config: { ...CONFIG, resultsPerBatch: 500 }, reason: /resultsPerBatch/ },
    { config: { ...CONFIG, departments: { dia: ["Almacén"] } }, reason: /not an acquisition source/ },
    { config: CONFIG, fetchTree: treeFetcher({ disco: [], carrefour: [] }), reason: /no allowlisted category/ },
  ];

  for (const entry of cases) {
    const resolution = await resolveRefreshPlan({
      dependencies: {
        readFile: readerWith(entry.config),
        fetchTree: entry.fetchTree ?? treeFetcher(),
        baseUrlFor: () => "https://example.test",
      },
    });
    assert.equal(resolution.mode, "fallback");
    assert.match(resolution.reason ?? "", entry.reason);
    assert.ok(resolution.batches.length > 0);
  }
});

test("parseFrozenPlan rejects a malformed plan instead of silently publishing nothing", () => {
  for (const payload of [null, {}, { batches: [] }, { batches: [{ ordinal: 1 }] }, { batches: [{ ordinal: 1, source: "disco", term: "leche", count: 0, expectedGtins: [] }] }]) {
    assert.throws(() => parseFrozenPlan(payload), /invalid frozen plan/);
  }
  const parsed = parseFrozenPlan({ batches: [{ ordinal: 2, source: "disco", term: "leche", count: 1, expectedGtins: [7790000000003] }] });
  assert.deepEqual(parsed, [{ ordinal: 2, source: "disco", term: "leche", count: 1, expectedGtins: ["7790000000003"] }]);
});

test("resolveRefreshPlan rotates by UTC date and reports the rotation window", async () => {
  const dependencies = { readFile: readerWith(CONFIG), fetchTree: treeFetcher(), baseUrlFor: () => "https://example.test" };
  const first = await resolveRefreshPlan({ now: new Date("2026-10-02T23:59:00.000Z"), dependencies });
  const second = await resolveRefreshPlan({ now: new Date("2026-10-03T00:01:00.000Z"), dependencies });

  assert.equal(first.rotation.dayIndex, Math.floor(Date.parse("2026-10-02T23:59:00.000Z") / 86_400_000));
  assert.equal(second.rotation.dayIndex, first.rotation.dayIndex + 1);
  assert.ok(first.rotation.windowDays > 0);
  assert.equal(second.rotation.windowDays, first.rotation.windowDays);
  assert.notDeepEqual(second.batches.map((batch) => batch.term), first.batches.map((batch) => batch.term));
});

test("refreshBatchId separates discovered and fallback plans for the same day", () => {
  assert.equal(refreshBatchId("20261002", "discovered", 1), "v1-refresh-20261002-d-01");
  assert.equal(refreshBatchId("20261002", "fallback", 1), "v1-refresh-20261002-f-01");
  assert.equal(refreshBatchId("20261002", "discovered", 12), "v1-refresh-20261002-d-12");
  assert.notEqual(refreshBatchId("20261002", "discovered", 3), refreshBatchId("20261002", "fallback", 3));
});

test("fetchVtexCategoryTree retries transient failures and gives up with the last error", async () => {
  let calls = 0;
  const data = await fetchVtexCategoryTree({
    baseUrl: "https://example.test",
    retries: 3,
    dependencies: {
      sleep: async () => undefined,
      http: { get: async () => (++calls < 3 ? Promise.reject(new Error("boom")) : Promise.resolve({ data: [{ id: 1 }] })) },
    },
  });
  assert.equal(calls, 3);
  assert.deepEqual(data, [{ id: 1 }]);

  await assert.rejects(
    fetchVtexCategoryTree({
      baseUrl: "https://example.test",
      retries: 2,
      dependencies: { sleep: async () => undefined, http: { get: async () => { throw new Error("blocked"); } } },
    }),
    /blocked/,
  );
});
