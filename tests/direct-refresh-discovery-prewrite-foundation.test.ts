import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("direct-refresh discovery prewrite foundation", () => {
	it("keeps the schema constraints required before discovery writes", async () => {
		const schema = await readFile("prisma/schema.prisma", "utf8");

		assert.match(schema, /model Product \{[\s\S]*?\bean\s+String\s+@id/);
		assert.match(
			schema,
			/model SupermarketProduct \{[\s\S]*?@@unique\(\[product_ean,\s*supermarket_id\]\)/,
		);
		assert.match(
			schema,
			/model PriceHistory \{[\s\S]*?@@index\(\[supermarket_product_id,\s*scraped_at\]\)/,
		);
		assert.match(
			schema,
			/model StagingProduct \{[\s\S]*?@@index\(\[ean,\s*source_slug\]\)/,
		);
		assert.match(
			schema,
			/model DirectRefreshRunLedger \{[\s\S]*?\brun_key\s+String\s+@unique/,
		);
		assert.match(
			schema,
			/model DirectRefreshRunLedger \{[\s\S]*?@@unique\(\[source_slug,\s*attempt_id\]\)/,
		);
	});

	it("adds a source-scoped non-null SKU uniqueness guard for discovery creates", async () => {
		const migration = await readFile(
			"prisma/migrations/20260606_discovery_prewrite_foundation/migration.sql",
			"utf8",
		);

		assert.match(
			migration,
			/CREATE\s+UNIQUE\s+INDEX\s+"supermarket_products_source_sku_unique_nonnull"/i,
		);
		assert.match(migration, /ON\s+"supermarket_products"\s*\("supermarket_id",\s*"sku_id"\)/i);
		assert.match(migration, /WHERE\s+"sku_id"\s+IS\s+NOT\s+NULL/i);
		assert.doesNotMatch(migration, /DELETE\s+FROM\s+"supermarket_products"/i);
	});
});
