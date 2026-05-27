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
});
