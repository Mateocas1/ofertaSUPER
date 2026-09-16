import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { canonicalize, sha256Canonical } from "../../src/lib/production-readiness/canonical";

describe("os03-c14n/v1", () => {
	it("orders object keys while preserving array order and decimal strings", () => {
		const first = canonicalize({ z: ["02.00", "01.00"], a: { y: null, x: "1" } });
		const second = canonicalize({ a: { x: "1", y: null }, z: ["02.00", "01.00"] });

		assert.equal(first, '{"a":{"x":"1","y":null},"z":["02.00","01.00"]}');
		assert.equal(sha256Canonical(JSON.parse(first)), sha256Canonical(JSON.parse(second)));
	});

	it("rejects unsupported values, unsafe numbers, invalid Unicode, and noncanonical decimal forms", () => {
		assert.throws(() => canonicalize({ value: Number.NaN }));
		assert.throws(() => canonicalize({ value: 1.2 }));
		assert.throws(() => canonicalize({ value: "1.2" }, { decimalPaths: ["/value"] }));
		assert.throws(() => canonicalize({ value: "01.20" }, { decimalPaths: ["/value"] }));
		assert.throws(() => canonicalize({ value: "\ud800" }));
		assert.throws(() => canonicalize({ value: undefined }));
	});
});
