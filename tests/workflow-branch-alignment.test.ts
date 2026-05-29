import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const workflow = readFileSync(".github/workflows/lighthouse-ci.yml", "utf8");

describe("workflow branch alignment", () => {
	it("runs Lighthouse push checks on master", () => {
		assert.match(workflow, /branches:\s*\n\s*- master/);
		assert.doesNotMatch(workflow, /branches:\s*\n\s*- main/);
	});
});
