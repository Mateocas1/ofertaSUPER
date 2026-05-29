import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("metrics dry-run safety", () => {
	it("checks dry-run before Redis dedupe writes", () => {
		const source = readFileSync("scripts/pipeline/metrics.ts", "utf8");
		const dryRunIndex = source.indexOf("if (options.dryRun)");
		const shouldSendIndex = source.indexOf("shouldSendAlert(options.dedupeKey)");

		assert.ok(dryRunIndex >= 0, "sendWebhookAlert must have a dry-run branch");
		assert.ok(shouldSendIndex >= 0, "sendWebhookAlert should still dedupe real alerts");
		assert.ok(dryRunIndex < shouldSendIndex, "dry-run must return before Redis dedupe side effects");
	});
});
