import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";
import { describe, it } from "node:test";

// Every public surface, discovered instead of listed: a hand-kept list went
// stale as copy moved into components. Admin and API routes are not public copy.
function listSources(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) return listSources(path);
		return /\.(ts|tsx)$/.test(entry.name) ? [path.split(sep).join("/")] : [];
	});
}

const PUBLIC_COPY_FILES = [
	...listSources("src/app").filter((path) => !/^src\/app\/(admin|api)\//.test(path)),
	...listSources("src/components").filter((path) => !/\/admin-/.test(path)),
	// Libraries that hold user-facing sentences.
	"src/lib/home-ui-data.ts",
	"src/lib/price-drops.ts",
	"src/lib/price-freshness.ts",
	"src/lib/product-card-offers.ts",
	"src/lib/seo/schema.ts",
];

const UNBACKED_LIVE_PRICE_PATTERN =
	/\b(Mercado vivo|precio actual|precio real|(?<!no )(?<!no son )(?<!no muestra )precios actuales|mejor total actual|en vivo|Actualizado hoy|Datos actualizados hoy|última semana|ultima semana)\b/i;

describe("public price copy claims", () => {
	it("keeps public surfaces away from unbacked live/current price language", () => {
		assert.match("Estos son precios actuales", UNBACKED_LIVE_PRICE_PATTERN);
		assert.doesNotMatch("No son precios actuales; no muestra precios actuales", UNBACKED_LIVE_PRICE_PATTERN);
		assert.ok(PUBLIC_COPY_FILES.includes("src/components/product/product-hero.tsx"), "discovers component copy");
		assert.ok(!PUBLIC_COPY_FILES.some((path) => path.startsWith("src/app/admin/")), "skips admin");
		for (const filePath of PUBLIC_COPY_FILES) {
			const source = readFileSync(filePath, "utf8");

			assert.doesNotMatch(
				source,
				UNBACKED_LIVE_PRICE_PATTERN,
				`${filePath} has unbacked live/current price copy`,
			);
		}
	});
});
