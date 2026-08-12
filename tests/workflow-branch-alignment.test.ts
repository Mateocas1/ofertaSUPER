import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const workflow = readFileSync(".github/workflows/lighthouse-ci.yml", "utf8");

describe("workflow branch alignment", () => {
	it("runs Lighthouse push checks on master", () => {
		assert.match(workflow, /branches:\s*\n\s*- master/);
		assert.doesNotMatch(workflow, /branches:\s*\n\s*- main/);
	});

	it("runs Lighthouse in explicit credential-free catalog mode without dropping routes", () => {
		assert.doesNotMatch(workflow, /\$\{\{\s*secrets\./);
		assert.match(workflow, /env:\s*\n\s*CATALOG_OFFLINE_MODE: "true"/);
		assert.doesNotMatch(workflow, /NEXT_PUBLIC_[A-Z_]*OFFLINE/);
		for (const route of ["/", "/ofertas", "/buscar?q=yerba", "/canasta"]) {
			assert.equal(workflow.includes(`http://127.0.0.1:3000${route}`), true);
		}
	});
});
