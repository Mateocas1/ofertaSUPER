# Direct-refresh Discovery Postwrite Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only postwrite audit that proves the exact rows created by `direct-refresh:discovery-create apply` before the first discovery pilot can be accepted.

**Architecture:** Keep the existing prewrite/apply gate unchanged. Add a focused audit module that compares the fresh prewrite artifact, apply artifact, and current DB rows, then expose it as a third `postwrite` mode under the existing `direct-refresh:discovery-create` CLI.

**Tech Stack:** TypeScript, Prisma, `node:test` through `tsx --test`, existing direct-refresh JSON artifacts.

---

## Boundaries

- No production writes during this implementation.
- No scheduler, all-source, repeated batch, DIA, deploy, cache, secrets, or remote-config path.
- No `npm run build`; project instruction forbids builds after changes.
- No change to `refresh-existing`.
- Fail closed on artifact mismatch, missing row, extra selected source row, extra price history row, or rollback plan without exact IDs.

## File map

| File | Responsibility |
| --- | --- |
| `scripts/pipeline/direct-refresh-discovery-postwrite-audit.ts` | New pure audit builder, report types, repository interface, row comparison helpers. |
| `tests/direct-refresh-discovery-postwrite-audit.test.ts` | New unit tests for PASS and fail-closed audit outcomes. |
| `scripts/direct-refresh-discovery-create.ts` | Add `postwrite` parser, runner, and Prisma read repository. |
| `tests/direct-refresh-discovery-create-gate.test.ts` | Extend CLI tests for `postwrite` mode and guarded flags. |
| `docs/direct-refresh-discovery-controlled-pilot-prd.md` | Document the real postwrite command and stop rule. |
| `docs/direct-refresh-discovery-mode-plan.md` | Add postwrite to the create-gate rollout table. |

## Report contract

The new audit report must use this shape:

```ts
export type DirectRefreshDiscoveryCreatePostwriteReport = {
  schemaVersion: 1;
  audit: "direct-refresh-discovery-create-postwrite";
  status: "PASS" | "FAIL";
  issue: number;
  generatedAt: string;
  source: string;
  count: number;
  selectedKeys: string[];
  applyGeneratedAt: string;
  prewriteGeneratedAt: string;
  summary: {
    productsExpected: number;
    productsFound: number;
    supermarketProductsExpected: number;
    supermarketProductsFound: number;
    priceHistoryExpected: number;
    priceHistoryFound: number;
    failClosedReasons: string[];
  };
  createdRows: {
    products: Array<{ ean: string; name: string | null; brand: string | null; category: string | null; imageUrl: string | null }>;
    supermarketProducts: Array<{ id: number; productEan: string; supermarketId: number; skuId: string | null; price: number | null; listPrice: number | null; productUrl: string | null; lastCheckedAt: string | null }>;
    priceHistory: Array<{ id: number; supermarketProductId: number; price: number | null; listPrice: number | null; scrapedAt: string | null }>;
  };
  noExtraRows: { products: boolean; supermarketProducts: boolean; priceHistory: boolean };
  rollbackPlan: {
    deletePriceHistoryIds: number[];
    deleteSupermarketProductIds: number[];
    deleteProductEans: string[];
  };
};
```

## Task 1: Write the pure audit tests

**Files:**
- Create: `tests/direct-refresh-discovery-postwrite-audit.test.ts`

- [ ] **Step 1: Add fixture builders**

Create fixture helpers with these exact exported-type imports:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildDirectRefreshDiscoveryCreatePostwriteAudit,
  type DirectRefreshDiscoveryCreatePostwriteRepository,
} from "../scripts/pipeline/direct-refresh-discovery-postwrite-audit";
import type {
  DirectRefreshDiscoveryCreateApplyReport,
  DirectRefreshDiscoveryCreatePrewriteReport,
} from "../scripts/pipeline/direct-refresh-discovery-create-gate";
```

Fixture constants:

```ts
const prewriteGeneratedAt = "2026-06-06T10:00:00.000Z";
const applyGeneratedAt = "2026-06-06T10:02:00.000Z";
const auditNow = new Date("2026-06-06T10:03:00.000Z");
```

Create helpers with concrete fixture data:

```ts
function sourceRowPrewrite(): DirectRefreshDiscoveryCreatePrewriteReport {
  return {
    schemaVersion: 1,
    gate: "direct-refresh-discovery-create-prewrite",
    status: "PASS",
    issue: 184,
    generatedAt: prewriteGeneratedAt,
    filters: { source: "vea", term: "leche", count: 1, scanCount: 5 },
    exactConfirmation: "direct-refresh-discovery-create issue=184 source=vea count=1 keys=discovery:vea:111:sku-111",
    summary: { selectedKeys: ["discovery:vea:111:sku-111"], productCreatesPlanned: 0, supermarketProductCreatesPlanned: 1, priceHistoryCreatesPlanned: 1, failClosedReasons: [] },
    plannedCreates: [{
      idempotencyKey: "discovery:vea:111:sku-111",
      classification: "source-row-discovery",
      product: { ean: "111", name: "Leche 111", brand: "Marca", description: "Leche entera", imageUrl: "https://www.vea.com.ar/111.jpg", images: ["https://www.vea.com.ar/111.jpg"], category: "Lacteos" },
      supermarketProduct: { productEan: "111", supermarketId: 7, price: 100, listPrice: 120, referencePrice: 100, referenceUnit: "lt", isAvailable: true, skuId: "sku-111", sellerId: "seller", productUrl: "https://www.vea.com.ar/product/111", lastCheckedAt: prewriteGeneratedAt },
      priceHistory: { price: 100, listPrice: 120, scrapedAt: prewriteGeneratedAt },
      rollbackPreview: { deleteCreatedProduct: false, deleteCreatedSupermarketProduct: true, deleteCreatedPriceHistory: true },
    }],
  };
}

function productAndSourcePrewrite(): DirectRefreshDiscoveryCreatePrewriteReport {
  const base = sourceRowPrewrite();
  return {
    ...base,
    exactConfirmation: "direct-refresh-discovery-create issue=184 source=vea count=1 keys=discovery:vea:222:sku-222",
    summary: { selectedKeys: ["discovery:vea:222:sku-222"], productCreatesPlanned: 1, supermarketProductCreatesPlanned: 1, priceHistoryCreatesPlanned: 1, failClosedReasons: [] },
    plannedCreates: [{
      ...base.plannedCreates[0],
      idempotencyKey: "discovery:vea:222:sku-222",
      classification: "product-and-source-discovery",
      product: { ...base.plannedCreates[0].product, ean: "222", name: "Leche 222", imageUrl: "https://www.vea.com.ar/222.jpg", images: ["https://www.vea.com.ar/222.jpg"] },
      supermarketProduct: { ...base.plannedCreates[0].supermarketProduct, productEan: "222", skuId: "sku-222", productUrl: "https://www.vea.com.ar/product/222" },
      rollbackPreview: { deleteCreatedProduct: true, deleteCreatedSupermarketProduct: true, deleteCreatedPriceHistory: true },
    }],
  };
}

function applyReport(overrides: Partial<DirectRefreshDiscoveryCreateApplyReport> = {}): DirectRefreshDiscoveryCreateApplyReport {
  return {
    schemaVersion: 1,
    gate: "direct-refresh-discovery-create-apply",
    status: "PASS",
    issue: 184,
    generatedAt: applyGeneratedAt,
    prewriteGeneratedAt,
    summary: { productsCreated: 0, supermarketProductsCreated: 1, priceHistoryCreated: 1, failClosedReasons: [] },
    appliedCreates: [{ idempotencyKey: "discovery:vea:111:sku-111", productEan: "111", supermarketProductId: 901, priceHistoryId: 1001 }],
    ...overrides,
  };
}

function repository(overrides: Partial<DirectRefreshDiscoveryCreatePostwriteRepository> = {}): DirectRefreshDiscoveryCreatePostwriteRepository {
  return {
    getProductsByEan: async () => [{ ean: "111", name: "Leche 111", brand: "Marca", category: "Lacteos", imageUrl: "https://www.vea.com.ar/111.jpg" }],
    getSupermarketProductsByIds: async () => [{ id: 901, productEan: "111", supermarketId: 7, skuId: "sku-111", price: 100, listPrice: 120, productUrl: "https://www.vea.com.ar/product/111", lastCheckedAt: prewriteGeneratedAt }],
    getSupermarketProductsBySourceEanPairs: async () => [{ id: 901, productEan: "111", supermarketId: 7, skuId: "sku-111", price: 100, listPrice: 120, productUrl: "https://www.vea.com.ar/product/111", lastCheckedAt: prewriteGeneratedAt }],
    getPriceHistoryRowsByIds: async () => [{ id: 1001, supermarketProductId: 901, price: 100, listPrice: 120, scrapedAt: prewriteGeneratedAt }],
    getPriceHistoryRowsForSupermarketProductsSince: async () => [{ id: 1001, supermarketProductId: 901, price: 100, listPrice: 120, scrapedAt: prewriteGeneratedAt }],
    ...overrides,
  };
}
```

- [ ] **Step 2: Add PASS coverage for source-row discovery**

```ts
it("passes when source and history rows match the apply artifact exactly", async () => {
  const report = await buildDirectRefreshDiscoveryCreatePostwriteAudit({
    prewrite: sourceRowPrewrite(),
    apply: applyReport(),
    repository: repository(),
    now: auditNow,
  });

  assert.equal(report.status, "PASS");
  assert.equal(report.issue, 184);
  assert.equal(report.source, "vea");
  assert.equal(report.count, 1);
  assert.deepEqual(report.selectedKeys, ["discovery:vea:111:sku-111"]);
  assert.equal(report.summary.productsExpected, 0);
  assert.equal(report.summary.productsFound, 0);
  assert.equal(report.summary.supermarketProductsFound, 1);
  assert.equal(report.summary.priceHistoryFound, 1);
  assert.deepEqual(report.createdRows.products, []);
  assert.deepEqual(report.createdRows.supermarketProducts.map((row) => row.id), [901]);
  assert.deepEqual(report.createdRows.priceHistory.map((row) => row.id), [1001]);
  assert.deepEqual(report.noExtraRows, { products: true, supermarketProducts: true, priceHistory: true });
  assert.deepEqual(report.rollbackPlan, {
    deletePriceHistoryIds: [1001],
    deleteSupermarketProductIds: [901],
    deleteProductEans: [],
  });
});
```

- [ ] **Step 3: Add fail-closed coverage for mismatched artifacts**

```ts
it("fails closed when prewrite and apply artifacts describe different attempts", async () => {
  const report = await buildDirectRefreshDiscoveryCreatePostwriteAudit({
    prewrite: sourceRowPrewrite(),
    apply: applyReport({ issue: 999, prewriteGeneratedAt: "2026-06-06T09:59:00.000Z" }),
    repository: repository(),
    now: auditNow,
  });

  assert.equal(report.status, "FAIL");
  assert.match(report.summary.failClosedReasons.join("\n"), /apply issue must match prewrite issue/);
  assert.match(report.summary.failClosedReasons.join("\n"), /apply prewriteGeneratedAt must match prewrite generatedAt/);
  assert.deepEqual(report.rollbackPlan, { deletePriceHistoryIds: [], deleteSupermarketProductIds: [], deleteProductEans: [] });
});
```

- [ ] **Step 4: Add fail-closed coverage for missing rows**

```ts
it("fails closed when the created source row is missing", async () => {
  const report = await buildDirectRefreshDiscoveryCreatePostwriteAudit({
    prewrite: sourceRowPrewrite(),
    apply: applyReport(),
    repository: repository({ getSupermarketProductsByIds: async () => [] }),
    now: auditNow,
  });

  assert.equal(report.status, "FAIL");
  assert.match(report.summary.failClosedReasons.join("\n"), /missing created supermarket_products id 901/);
  assert.deepEqual(report.rollbackPlan.deleteSupermarketProductIds, []);
});
```

- [ ] **Step 5: Add fail-closed coverage for extra rows**

```ts
it("fails closed when extra source or price history rows exist for the selected discovery", async () => {
  const report = await buildDirectRefreshDiscoveryCreatePostwriteAudit({
    prewrite: sourceRowPrewrite(),
    apply: applyReport(),
    repository: repository({
      getSupermarketProductsBySourceEanPairs: async () => [
        { id: 901, productEan: "111", supermarketId: 7, skuId: "sku-111", price: 100, listPrice: 120, productUrl: "https://www.vea.com.ar/product/111", lastCheckedAt: prewriteGeneratedAt },
        { id: 902, productEan: "111", supermarketId: 7, skuId: "sku-duplicate", price: 101, listPrice: 121, productUrl: "https://www.vea.com.ar/product/111-duplicate", lastCheckedAt: applyGeneratedAt },
      ],
      getPriceHistoryRowsForSupermarketProductsSince: async () => [
        { id: 1001, supermarketProductId: 901, price: 100, listPrice: 120, scrapedAt: prewriteGeneratedAt },
        { id: 1002, supermarketProductId: 901, price: 101, listPrice: 121, scrapedAt: applyGeneratedAt },
      ],
    }),
    now: auditNow,
  });

  assert.equal(report.status, "FAIL");
  assert.equal(report.noExtraRows.supermarketProducts, false);
  assert.equal(report.noExtraRows.priceHistory, false);
  assert.match(report.summary.failClosedReasons.join("\n"), /extra supermarket_products rows for selected source\/EAN: 902/);
  assert.match(report.summary.failClosedReasons.join("\n"), /extra price_history rows for created source rows: 1002/);
});
```

- [ ] **Step 6: Add product-and-source rollback coverage**

```ts
it("includes product rollback only for product-and-source discovery", async () => {
  const report = await buildDirectRefreshDiscoveryCreatePostwriteAudit({
    prewrite: productAndSourcePrewrite(),
    apply: applyReport({
      summary: { productsCreated: 1, supermarketProductsCreated: 1, priceHistoryCreated: 1, failClosedReasons: [] },
      appliedCreates: [{ idempotencyKey: "discovery:vea:222:sku-222", productEan: "222", supermarketProductId: 902, priceHistoryId: 1002 }],
    }),
    repository: repository({
      getProductsByEan: async () => [{ ean: "222", name: "Leche 222", brand: "Marca", category: "Lacteos", imageUrl: "https://www.vea.com.ar/222.jpg" }],
      getSupermarketProductsByIds: async () => [{ id: 902, productEan: "222", supermarketId: 7, skuId: "sku-222", price: 100, listPrice: 120, productUrl: "https://www.vea.com.ar/product/222", lastCheckedAt: prewriteGeneratedAt }],
      getSupermarketProductsBySourceEanPairs: async () => [{ id: 902, productEan: "222", supermarketId: 7, skuId: "sku-222", price: 100, listPrice: 120, productUrl: "https://www.vea.com.ar/product/222", lastCheckedAt: prewriteGeneratedAt }],
      getPriceHistoryRowsByIds: async () => [{ id: 1002, supermarketProductId: 902, price: 100, listPrice: 120, scrapedAt: prewriteGeneratedAt }],
      getPriceHistoryRowsForSupermarketProductsSince: async () => [{ id: 1002, supermarketProductId: 902, price: 100, listPrice: 120, scrapedAt: prewriteGeneratedAt }],
    }),
    now: auditNow,
  });

  assert.equal(report.status, "PASS");
  assert.deepEqual(report.createdRows.products.map((row) => row.ean), ["222"]);
  assert.deepEqual(report.rollbackPlan.deleteProductEans, ["222"]);
});
```

- [ ] **Step 7: Prove RED**

Run:

```bash
npx tsx --test tests/direct-refresh-discovery-postwrite-audit.test.ts
```

Expected: fails because the postwrite audit module is not present yet.

## Task 2: Build the pure postwrite audit module

**Files:**
- Create: `scripts/pipeline/direct-refresh-discovery-postwrite-audit.ts`

- [ ] **Step 1: Add repository and row types**

```ts
import type {
  DirectRefreshDiscoveryCreateApplyReport,
  DirectRefreshDiscoveryCreatePrewriteReport,
} from "./direct-refresh-discovery-create-gate";

export type DirectRefreshDiscoveryCreatePostwriteRepository = {
  getProductsByEan(eans: string[]): Promise<DirectRefreshDiscoveryPostwriteProductRow[]>;
  getSupermarketProductsByIds(ids: number[]): Promise<DirectRefreshDiscoveryPostwriteSupermarketProductRow[]>;
  getSupermarketProductsBySourceEanPairs(pairs: Array<{ productEan: string; supermarketId: number }>): Promise<DirectRefreshDiscoveryPostwriteSupermarketProductRow[]>;
  getPriceHistoryRowsByIds(ids: number[]): Promise<DirectRefreshDiscoveryPostwritePriceHistoryRow[]>;
  getPriceHistoryRowsForSupermarketProductsSince(supermarketProductIds: number[], sinceIso: string): Promise<DirectRefreshDiscoveryPostwritePriceHistoryRow[]>;
};
```

Define the three row types from the report contract before the repository type.

- [ ] **Step 2: Add builder options and artifact checks**

```ts
export type BuildDirectRefreshDiscoveryCreatePostwriteAuditOptions = {
  prewrite: DirectRefreshDiscoveryCreatePrewriteReport;
  apply: DirectRefreshDiscoveryCreateApplyReport;
  repository: DirectRefreshDiscoveryCreatePostwriteRepository;
  now?: Date;
};

const generatedAt = now.toISOString();
const failClosedReasons: string[] = [];
if (prewrite.status !== "PASS") failClosedReasons.push("prewrite status must be PASS");
if (apply.status !== "PASS") failClosedReasons.push("apply status must be PASS");
if (apply.issue !== prewrite.issue) failClosedReasons.push("apply issue must match prewrite issue");
if (apply.prewriteGeneratedAt !== prewrite.generatedAt) failClosedReasons.push("apply prewriteGeneratedAt must match prewrite generatedAt");
```

Key/count checks:

```ts
if (prewrite.summary.selectedKeys.length !== prewrite.filters.count) failClosedReasons.push(`selected key count must match prewrite count ${prewrite.filters.count}`);
if (prewrite.plannedCreates.length !== prewrite.summary.selectedKeys.length) failClosedReasons.push("planned create count must match selected key count");
if (apply.appliedCreates.length !== prewrite.summary.selectedKeys.length) failClosedReasons.push("applied create count must match selected key count");
```

For each selected key, verify a matching planned create and applied create exists. If not, add `selected key missing from planned creates: <key>` or `selected key missing from applied creates: <key>`.

- [ ] **Step 3: Read DB rows only after artifact shape passes**

```ts
const plannedCreates = selectedKeys.map((key) => plannedByKey.get(key)).filter((row): row is NonNullable<typeof row> => Boolean(row));
const appliedCreates = selectedKeys.map((key) => appliedByKey.get(key)).filter((row): row is NonNullable<typeof row> => Boolean(row));
const productAndSourceEans = plannedCreates.filter((plan) => plan.classification === "product-and-source-discovery").map((plan) => plan.product.ean);
const supermarketProductIds = appliedCreates.map((row) => row.supermarketProductId);
const priceHistoryIds = appliedCreates.map((row) => row.priceHistoryId);
const sourcePairs = plannedCreates.map((plan) => ({ productEan: plan.product.ean, supermarketId: plan.supermarketProduct.supermarketId }));
```

Read:

```ts
const [products, supermarketProductsById, sourceRows, priceHistoryById, priceHistoryForSourceRows] = await Promise.all([
  productAndSourceEans.length ? repository.getProductsByEan(productAndSourceEans) : Promise.resolve([]),
  supermarketProductIds.length ? repository.getSupermarketProductsByIds(supermarketProductIds) : Promise.resolve([]),
  sourcePairs.length ? repository.getSupermarketProductsBySourceEanPairs(sourcePairs) : Promise.resolve([]),
  priceHistoryIds.length ? repository.getPriceHistoryRowsByIds(priceHistoryIds) : Promise.resolve([]),
  supermarketProductIds.length ? repository.getPriceHistoryRowsForSupermarketProductsSince(supermarketProductIds, prewrite.generatedAt) : Promise.resolve([]),
]);
```

- [ ] **Step 4: Compare exact created rows**

Required fail messages:

```text
missing created product ean <ean>
missing created supermarket_products id <id>
missing created price_history id <id>
supermarket_products id <id> productEan mismatch
supermarket_products id <id> supermarketId mismatch
supermarket_products id <id> skuId mismatch
supermarket_products id <id> price mismatch
supermarket_products id <id> listPrice mismatch
supermarket_products id <id> productUrl mismatch
supermarket_products id <id> lastCheckedAt mismatch
price_history id <id> supermarketProductId mismatch
price_history id <id> price mismatch
price_history id <id> listPrice mismatch
price_history id <id> scrapedAt mismatch
```

Use strict equality for numbers, strings, nulls, and ISO timestamps. Sort numeric ID arrays ascending and string arrays lexicographically before returning.

- [ ] **Step 5: Detect extra rows**

```ts
const expectedSourceIds = new Set(supermarketProductIds);
const extraSourceIds = sourceRows.map((row) => row.id).filter((id) => !expectedSourceIds.has(id));
if (extraSourceIds.length > 0) failClosedReasons.push(`extra supermarket_products rows for selected source/EAN: ${sortedNumbers(extraSourceIds).join(",")}`);

const expectedHistoryIds = new Set(priceHistoryIds);
const extraHistoryIds = priceHistoryForSourceRows.map((row) => row.id).filter((id) => !expectedHistoryIds.has(id));
if (extraHistoryIds.length > 0) failClosedReasons.push(`extra price_history rows for created source rows: ${sortedNumbers(extraHistoryIds).join(",")}`);
```

Set `noExtraRows.products` to true only when every product-and-source EAN has exactly one product row. Source-row discovery reports zero created products.

- [ ] **Step 6: Build rollback only on PASS**

```ts
const status = failClosedReasons.length === 0 ? "PASS" : "FAIL";
const rollbackPlan = status === "PASS"
  ? {
      deletePriceHistoryIds: sortedNumbers(priceHistoryIds),
      deleteSupermarketProductIds: sortedNumbers(supermarketProductIds),
      deleteProductEans: sortedStrings(productAndSourceEans),
    }
  : { deletePriceHistoryIds: [], deleteSupermarketProductIds: [], deleteProductEans: [] };
```

- [ ] **Step 7: Prove GREEN**

Run:

```bash
npx tsx --test tests/direct-refresh-discovery-postwrite-audit.test.ts
```

Expected: all tests in the new file pass.

- [ ] **Step 8: Commit**

```bash
git add scripts/pipeline/direct-refresh-discovery-postwrite-audit.ts tests/direct-refresh-discovery-postwrite-audit.test.ts
git commit -m "feat(data): add discovery postwrite audit"
```

## Task 3: Wire the CLI

**Files:**
- Modify: `scripts/direct-refresh-discovery-create.ts`
- Modify: `tests/direct-refresh-discovery-create-gate.test.ts`

- [ ] **Step 1: Add CLI parser tests first**

Extend imports:

```ts
import {
  parseDirectRefreshDiscoveryCreateApplyCliOptions,
  parseDirectRefreshDiscoveryCreatePostwriteCliOptions,
  parseDirectRefreshDiscoveryCreatePrewriteCliOptions,
} from "../scripts/direct-refresh-discovery-create";
```

Add assertions:

```ts
const postwrite = parseDirectRefreshDiscoveryCreatePostwriteCliOptions([
  "node",
  "script",
  "postwrite",
  "--prewrite=audit/prewrite.json",
  "--apply=audit/apply.json",
  "--output=audit/postwrite.json",
]);
assert.deepEqual(postwrite, { prewrite: "audit/prewrite.json", apply: "audit/apply.json", output: "audit/postwrite.json" });

assert.throws(
  () => parseDirectRefreshDiscoveryCreatePostwriteCliOptions(["node", "script", "postwrite", "--prewrite=audit/prewrite.json", "--apply=audit/apply.json", "--scheduler"]),
  /direct-refresh discovery create postwrite rejects --scheduler/,
);
```

- [ ] **Step 2: Prove RED**

Run:

```bash
npx tsx --test tests/direct-refresh-discovery-create-gate.test.ts
```

Expected: fails because the postwrite parser is not exported yet.

- [ ] **Step 3: Add parser and mode dispatch**

In `scripts/direct-refresh-discovery-create.ts`:

```ts
export type DirectRefreshDiscoveryCreatePostwriteCliOptions = {
  prewrite: string;
  apply: string;
  output: string | null;
};

const POSTWRITE_ALLOWED_FLAGS = new Set(["--prewrite", "--apply", "--output"]);

export function parseDirectRefreshDiscoveryCreatePostwriteCliOptions(argv = process.argv): DirectRefreshDiscoveryCreatePostwriteCliOptions {
  const args = argv.slice(3);
  assertNoForbidden(args, "direct-refresh discovery create postwrite");
  assertOnlyAllowed(args, POSTWRITE_ALLOWED_FLAGS);
  return {
    prewrite: requiredRawFlag(argv, "--prewrite"),
    apply: requiredRawFlag(argv, "--apply"),
    output: optionalSingleRawFlag(argv, "--output"),
  };
}
```

Update `main()` to accept `postwrite` and change the error to:

```ts
throw new Error("direct-refresh discovery create requires mode: prewrite, apply, or postwrite");
```

- [ ] **Step 4: Add Prisma read repository**

Create `createPrismaDiscoveryPostwriteRepository()` beside the existing create repository. Query:

- `product.findMany` by EAN with `ean`, `name`, `brand`, `category`, `image_url`.
- `supermarketProduct.findMany` by IDs.
- `supermarketProduct.findMany` by `OR` pairs of `product_ean` and `supermarket_id`.
- `priceHistory.findMany` by IDs.
- `priceHistory.findMany` by `supermarket_product_id in (...)` and `scraped_at >= new Date(prewrite.generatedAt)`.

Use helper mappers:

```ts
function numberOrNull(value: Prisma.Decimal | number | null) {
  return value === null ? null : Number(value);
}

function isoOrNull(value: Date | null) {
  return value ? value.toISOString() : null;
}
```

- [ ] **Step 5: Add `runPostwrite()`**

```ts
async function runPostwrite() {
  const options = parseDirectRefreshDiscoveryCreatePostwriteCliOptions();
  const prewrite = await readJson<DirectRefreshDiscoveryCreatePrewriteReport>(options.prewrite);
  const apply = await readJson<DirectRefreshDiscoveryCreateApplyReport>(options.apply);
  const report = await buildDirectRefreshDiscoveryCreatePostwriteAudit({
    prewrite,
    apply,
    repository: createPrismaDiscoveryPostwriteRepository(),
  });
  await writeJson(options.output, report);
  if (report.status === "FAIL") process.exitCode = 1;
}
```

- [ ] **Step 6: Prove CLI GREEN**

Run:

```bash
npx tsx --test tests/direct-refresh-discovery-create-gate.test.ts tests/direct-refresh-discovery-postwrite-audit.test.ts
```

Expected: both test files pass.

- [ ] **Step 7: Commit**

```bash
git add scripts/direct-refresh-discovery-create.ts tests/direct-refresh-discovery-create-gate.test.ts
git commit -m "feat(data): wire discovery postwrite cli"
```

## Task 4: Update operator docs

**Files:**
- Modify: `docs/direct-refresh-discovery-controlled-pilot-prd.md`
- Modify: `docs/direct-refresh-discovery-mode-plan.md`

- [ ] **Step 1: Add the postwrite command to the PRD**

Add this command under `Required implementation before apply`:

```bash
npm run direct-refresh:discovery-create -- postwrite \
  --prewrite=audit/direct-refresh-discovery-controlled-pilot/issue183/<timestamp>/discovery-create-prewrite.json \
  --apply=audit/direct-refresh-discovery-controlled-pilot/issue183/<timestamp>/discovery-create-apply.json \
  --output=audit/direct-refresh-discovery-controlled-pilot/issue183/<timestamp>/discovery-create-postwrite.json
```

State that the command is read-only and `PASS` is required before the pilot can be accepted.

- [ ] **Step 2: Extend the discovery-mode rollout table**

Add one row:

| Gate | Contract |
| --- | --- |
| Create postwrite | `npm run direct-refresh:discovery-create -- postwrite --prewrite=<prewrite-report> --apply=<apply-report> --output=<postwrite-report>` validates exact created IDs, no extra source/history rows, and ID-bound rollback. |

- [ ] **Step 3: Run docs hygiene**

Run a marker scan, an encoding scan, and whitespace check on changed markdown files. Expected: no matches and exit code 0 for `git diff --check`.

- [ ] **Step 4: Commit**

```bash
git add docs/direct-refresh-discovery-controlled-pilot-prd.md docs/direct-refresh-discovery-mode-plan.md docs/superpowers/plans/2026-06-06-direct-refresh-discovery-postwrite-audit.md
git commit -m "docs(data): document discovery postwrite audit"
```

## Task 5: Final verification

**Files:**
- Review all changed files from Tasks 1-4.

- [ ] **Step 1: Run targeted tests**

```bash
npx tsx --test tests/direct-refresh-discovery-postwrite-audit.test.ts tests/direct-refresh-discovery-create-gate.test.ts
```

Expected: pass.

- [ ] **Step 2: Run full suite**

```bash
npm test
```

Expected: pass. Record the test count from stdout.

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck
```

Expected: exit code 0.

- [ ] **Step 4: Run lint**

```bash
npm run lint
```

Expected: exit code 0.

- [ ] **Step 5: Run diff hygiene**

```bash
git diff --check
```

Expected: exit code 0.

- [ ] **Step 6: Confirm no forbidden action ran**

```bash
git status --short
```

Expected: only intentional tracked changes or a clean tracked state after commits; no generated production apply artifacts from this implementation work.

## Review workload forecast

| Item | Forecast |
| --- | --- |
| Estimated changed files | 6 |
| Estimated changed lines | 300-450 |
| 400-line budget risk | Medium |
| Chained PRs recommended | Yes if Task 2 makes the PR exceed the review budget |
| Decision needed before apply | Yes if implementation exceeds review budget or changes production-write semantics |

Recommended delivery: one implementation PR if the diff stays near the review budget; otherwise split builder/tests first and CLI/docs second.

## Acceptance checklist

- [ ] `direct-refresh:discovery-create postwrite` exists and is read-only.
- [ ] Postwrite rejects mismatched prewrite/apply artifacts.
- [ ] Postwrite proves exact `supermarket_products.id` and `price_history.id`.
- [ ] Postwrite proves no extra selected source/EAN rows.
- [ ] Postwrite proves no extra price history rows for created source rows since prewrite.
- [ ] Source-row rollback never deletes global `products`.
- [ ] Product-and-source rollback includes only the created product EAN.
- [ ] CLI rejects scheduler/all-source/repeat/deploy/cache/secrets/remote-config shaped flags.
- [ ] Docs show exact command and stop rule.
- [ ] `npm test`, `npm run typecheck`, and `npm run lint` pass.
- [ ] `npm run build` was not executed.
