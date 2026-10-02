import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  MAX_BATCHES_PER_RUN,
  MAX_RESULTS_PER_BATCH,
  buildDiscoveryPlan,
  collectCategoryTerms,
  interleaveCategoryTerms,
  normalizeCategoryName,
  parseCategoryTree,
  parseDiscoveryConfig,
  type DiscoveryConfig,
} from "../src/lib/discovery/category-plan";

async function fixture(source: string) {
  const raw = await readFile(new URL(`./fixtures/vtex/category-tree-${source}.json`, import.meta.url), "utf8");
  return JSON.parse(raw) as { source: string; tree: unknown };
}

const DEFAULT_LIMITS = { maxBatchesPerRun: 6, resultsPerBatch: 50 };

function config(overrides: Partial<DiscoveryConfig> = {}): DiscoveryConfig {
  return {
    schemaVersion: 1,
    maxBatchesPerRun: DEFAULT_LIMITS.maxBatchesPerRun,
    resultsPerBatch: DEFAULT_LIMITS.resultsPerBatch,
    departments: { disco: ["Almacén"], carrefour: ["Bebidas"] },
    ...overrides,
  };
}

test("parseCategoryTree accepts the live VTEX shape and rejects malformed payloads", async () => {
  const { tree } = await fixture("disco");
  const parsed = parseCategoryTree(tree);

  assert.ok(parsed.length > 10);
  assert.ok(parsed.some((node) => node.name === "Almacén" && node.hasChildren));
  assert.ok((parsed[0]?.children?.length ?? 0) > 0);

  for (const malformed of [null, {}, "nope", [{ id: "1", name: "x", hasChildren: false }], [{ id: 1, name: "", hasChildren: false }]]) {
    assert.throws(() => parseCategoryTree(malformed), /category tree/i);
  }
});

test("normalizeCategoryName folds accents, case and punctuation into one allowlist key", () => {
  assert.equal(normalizeCategoryName("  Lácteos  "), "lacteos");
  assert.equal(normalizeCategoryName("Perfumería y farmacia"), "perfumeria y farmacia");
  assert.equal(normalizeCategoryName("Mundo Bebé"), "mundo bebe");
  assert.equal(normalizeCategoryName("Panadería"), normalizeCategoryName("Panaderia"));
});

test("collectCategoryTerms keeps only allowlisted departments and returns their child category names", () => {
  const tree = parseCategoryTree([
    {
      id: 1,
      name: "Almacén",
      hasChildren: true,
      children: [
        { id: 2, name: "Aceites", hasChildren: true, children: [{ id: 3, name: "Aceites de Oliva", hasChildren: false, children: [] }] },
        { id: 4, name: "Arroz", hasChildren: false, children: [] },
      ],
    },
    { id: 5, name: "Electro", hasChildren: true, children: [{ id: 6, name: "Pilas", hasChildren: false, children: [] }] },
  ]);

  const collected = collectCategoryTerms(tree, ["almacen"]);

  assert.deepEqual(collected.terms, ["aceites", "arroz"]);
  assert.deepEqual(collected.byDepartment, [["aceites", "arroz"]]);
  assert.equal(collected.categoriesConsidered, 2);
  assert.equal(collected.departmentsMatched, 1);
});

test("collectCategoryTerms falls back to the department name when it is itself a leaf", () => {
  const tree = parseCategoryTree([{ id: 1, name: "Frutas y Verduras", hasChildren: false, children: [] }]);

  const collected = collectCategoryTerms(tree, ["frutas y verduras"]);

  assert.deepEqual(collected.terms, ["frutas y verduras"]);
  assert.equal(collected.departmentsMatched, 1);
});

test("collectCategoryTerms deduplicates repeated child names and tolerates an unmatched allowlist", () => {
  const tree = parseCategoryTree([
    { id: 1, name: "Bebidas", hasChildren: true, children: [
      { id: 2, name: "Gaseosas", hasChildren: false, children: [] },
      { id: 3, name: "Gaseosas", hasChildren: false, children: [] },
      { id: 4, name: "Jugos de Limón", hasChildren: false, children: [] },
    ] },
  ]);

  const collected = collectCategoryTerms(tree, ["bebidas"]);
  assert.deepEqual(collected.terms, ["gaseosas", "jugos de limon"]);
  assert.equal(collected.categoriesConsidered, 3);

  const unmatched = collectCategoryTerms(tree, ["carnes"]);
  assert.deepEqual(unmatched.terms, []);
  assert.equal(unmatched.departmentsMatched, 0);
});

test("buildDiscoveryPlan is deterministic across repeated runs", async () => {
  const disco = parseCategoryTree((await fixture("disco")).tree);
  const carrefour = parseCategoryTree((await fixture("carrefour")).tree);
  const input = { config: config(), treesBySource: { disco, carrefour } };

  const first = buildDiscoveryPlan(input);
  const second = buildDiscoveryPlan(input);

  assert.deepEqual(first, second);
  assert.ok(first.batches.length > 0);
});

const ROTATION_TREE = [
  { id: 1, name: "Almacén", hasChildren: true, children: [
    { id: 2, name: "Arroz", hasChildren: false, children: [] },
    { id: 3, name: "Cafe", hasChildren: false, children: [] },
    { id: 4, name: "Fideos", hasChildren: false, children: [] },
  ] },
  { id: 5, name: "Bebidas", hasChildren: true, children: [
    { id: 6, name: "Aguas", hasChildren: false, children: [] },
    { id: 7, name: "Gaseosas", hasChildren: false, children: [] },
  ] },
];

function rotationPlan(rotationDay: number) {
  return buildDiscoveryPlan({
    config: config({ maxBatchesPerRun: 2, departments: { disco: ["Almacén", "Bebidas"] } }),
    treesBySource: { disco: parseCategoryTree(ROTATION_TREE) },
    rotationDay,
  });
}

test("buildDiscoveryPlan rotates the sampled children deterministically by day", () => {
  const plan = (rotationDay: number) => rotationPlan(rotationDay).batches.map((batch) => batch.term);

  assert.deepEqual(plan(0), ["arroz", "aguas"]);
  assert.deepEqual(plan(1), ["gaseosas", "cafe"]);
  assert.deepEqual(plan(2), ["fideos", "aguas"]);
  assert.deepEqual(plan(0), plan(0), "the same UTC day always yields the same plan");
  assert.deepEqual(plan(2), rotationPlan(2).batches.map((batch) => batch.term));
});

test("rotation searches every child of every department within the bounded window", () => {
  const days = [0, 1, 2, 3, 4];
  const byTerm = new Map(days.map((day) => [day, rotationPlan(day).batches.map((batch) => batch.term)]));

  const almacen = new Set(["arroz", "cafe", "fideos", "aguas", "gaseosas"]);
  const seen = new Set(days.flatMap((day) => byTerm.get(day) ?? []));
  assert.deepEqual([...almacen].filter((term) => !seen.has(term)), [], "no department child is starved");

  const plan = rotationPlan(0);
  assert.equal(plan.rotation.dayIndex, 0);
  assert.equal(plan.rotation.windowDays, 3, "the window is the longest department, not the whole tree");
  assert.ok(plan.rotation.windowDays > 0);
});

test("rotation keeps every department reachable when the quota is below the department count", () => {
  const plan = (rotationDay: number) => buildDiscoveryPlan({
    config: config({ maxBatchesPerRun: 1, departments: { disco: ["Almacén", "Bebidas"] } }),
    treesBySource: { disco: parseCategoryTree(ROTATION_TREE) },
    rotationDay,
  });

  const sources = new Set([plan(0), plan(1), plan(2)].flatMap((entry) => entry.batches.map((batch) => batch.term)));
  assert.ok(sources.has("arroz") || sources.has("cafe") || sources.has("fideos"), "Almacén is sampled on some day");
  assert.ok(sources.has("aguas") || sources.has("gaseosas"), "Bebidas is sampled on some day");
});

test("buildDiscoveryPlan splits the per-run cap across stores and honors resultsPerBatch", async () => {
  const disco = parseCategoryTree((await fixture("disco")).tree);
  const carrefour = parseCategoryTree((await fixture("carrefour")).tree);

  const plan = buildDiscoveryPlan({ config: config({ maxBatchesPerRun: 5 }), treesBySource: { disco, carrefour } });

  assert.equal(plan.batches.length, 5);
  assert.deepEqual([...new Set(plan.batches.map((batch) => batch.source))], ["disco", "carrefour"]);
  assert.equal(plan.batches.filter((batch) => batch.source === "disco").length, 3);
  assert.equal(plan.batches.filter((batch) => batch.source === "carrefour").length, 2);
  assert.deepEqual(plan.batches.map((batch) => batch.ordinal), [1, 2, 3, 4, 5]);
  for (const batch of plan.batches) {
    assert.equal(batch.count, 50);
    assert.ok(batch.term.length > 0);
    assert.equal(batch.term, normalizeCategoryName(batch.term));
  }
  assert.equal(plan.truncated, true);
});

test("buildDiscoveryPlan never pads when a store has fewer categories than its quota", () => {
  const small = parseCategoryTree([
    { id: 1, name: "Rotisería", hasChildren: true, children: [
      { id: 2, name: "Empanadas", hasChildren: false, children: [] },
      { id: 3, name: "Pizzas", hasChildren: false, children: [] },
    ] },
    { id: 4, name: "Bebidas", hasChildren: true, children: [
      { id: 5, name: "Aguas", hasChildren: false, children: [] },
    ] },
  ]);

  const plan = buildDiscoveryPlan({
    config: config({ maxBatchesPerRun: 60, departments: { disco: ["Rotisería", "Bebidas"] } }),
    treesBySource: { disco: small },
  });

  assert.deepEqual(plan.batches.map((batch) => batch.term), ["empanadas", "aguas", "pizzas"]);
  assert.ok(plan.batches.length <= MAX_BATCHES_PER_RUN);
  assert.equal(plan.truncated, false);
});

test("interleaveCategoryTerms samples every department before repeating one", () => {
  const ordered = interleaveCategoryTerms([["almacen-a", "almacen-b"], ["bebidas-a"], ["lacteos-a", "lacteos-b"]]);
  assert.deepEqual(ordered, ["almacen-a", "bebidas-a", "lacteos-a", "almacen-b", "lacteos-b"]);
});

test("buildDiscoveryPlan spends a small quota across all allowlisted departments", async () => {
  const disco = parseCategoryTree((await fixture("disco")).tree);
  const plan = buildDiscoveryPlan({
    config: config({ maxBatchesPerRun: 60, departments: { disco: ["Almacén", "Bebidas", "Lácteos", "Limpieza"] } }),
    treesBySource: { disco },
  });

  const terms = plan.batches.map((batch) => batch.term);
  assert.equal(plan.batches.length, 56);
  assert.equal(terms.length, new Set(terms).size);
  assert.ok(terms.includes("aceites y vinagres"), "the first Almacén child is searched");
  assert.ok(terms.includes("aguas"), "the first Bebidas child is searched");
  assert.ok(terms.includes("cremas"), "the first Lácteos child is searched");
  assert.ok(terms.includes("accesorios de limpieza"), "the first Limpieza child is searched");
  assert.equal(plan.truncated, false);
});

test("parseDiscoveryConfig rejects a config that exceeds the hard caps or lists no department", () => {
  for (const invalid of [
    { ...config(), resultsPerBatch: MAX_RESULTS_PER_BATCH + 1 },
    { ...config(), maxBatchesPerRun: MAX_BATCHES_PER_RUN + 1 },
    { ...config(), maxBatchesPerRun: 0 },
    { ...config(), departments: {} },
    { ...config(), departments: { disco: [] } },
    { ...config(), departments: { disco: ["Almacén", 7] } },
    { ...config(), schemaVersion: 99 },
  ]) {
    assert.throws(() => parseDiscoveryConfig(invalid), /discovery config/i);
  }
});

test("parseDiscoveryConfig normalizes the allowlist and applies the configured caps", () => {
  const parsed = parseDiscoveryConfig({
    schemaVersion: 1,
    maxBatchesPerRun: 12,
    resultsPerBatch: 40,
    departments: { Disco: [" Almacén ", "Bebidas"] },
  });

  assert.equal(parsed.maxBatchesPerRun, 12);
  assert.equal(parsed.resultsPerBatch, 40);
  assert.deepEqual(parsed.departments.disco, ["almacen", "bebidas"]);
});
