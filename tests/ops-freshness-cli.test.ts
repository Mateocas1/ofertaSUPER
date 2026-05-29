import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { parseOpsFreshnessCliOptions } from "../scripts/audit-ops-freshness";

describe("ops freshness audit CLI", () => {
	it("defaults to non-mutating checks and rejects write-shaped flags", () => {
		assert.deepEqual(parseOpsFreshnessCliOptions(["node", "script"]), {
			checkRedis: false,
			output: null,
			runningRunMaxAgeMinutes: 60,
			pendingStagingMaxAgeMinutes: 60,
		});
		assert.throws(
			() => parseOpsFreshnessCliOptions(["node", "script", "--confirm-write"]),
			/read-only/,
		);
	});

	it("is wired as a package script", () => {
		const packageJson = readFileSync("package.json", "utf8");
		assert.match(packageJson, /"audit:ops-freshness": "tsx scripts\/audit-ops-freshness\.ts"/);
	});
});
