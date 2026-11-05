import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const METHODOLOGY_PAGE_PATH = join(
	process.cwd(),
	"src",
	"app",
	"metodologia",
	"page.tsx",
);
const PUBLIC_RED_FLAG_PATTERN =
	/\b(demo|mvp|prototype|prototipo|wip|not production-ready|blocked|pending|pendiente|v1|development|desarrollo)\b/i;

describe("methodology route", () => {
	it("has a polished App Router page for the home methodology link", () => {
		assert.equal(existsSync(METHODOLOGY_PAGE_PATH), true);

		const source = readFileSync(METHODOLOGY_PAGE_PATH, "utf8");

		assert.match(source, /export const metadata/);
		assert.match(source, /export default function/);
		assert.match(source, /Comparaci[oó]n por EAN/);
		assert.match(source, /Frescura visible/);
		assert.match(source, /Cobertura transparente/);
		assert.doesNotMatch(source, PUBLIC_RED_FLAG_PATTERN);
	});

	it("exposes stable section ids and reads the drop thresholds from the payload", () => {
		const source = readFileSync(METHODOLOGY_PAGE_PATH, "utf8");

		for (const id of ["umbrales-de-bajas", "frescura", "cobertura", "comparacion-por-ean"]) {
			assert.match(source, new RegExp(`id="${id}"`));
		}
		assert.match(source, /loadPriceDrops/);
		assert.match(source, /DEFAULT_PRICE_DROP_RULES/);
		assert.match(source, /rules\.minPercentDrop/);
		assert.doesNotMatch(source, /refresh|JSON precalculado/i);
	});
});
