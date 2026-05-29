import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
	buildProductDetailCacheKey,
	buildSearchCacheKey,
} from "../src/lib/cache-keys";

describe("public cache keys", () => {
	it("centralizes search and product detail cache keys", () => {
		assert.equal(buildSearchCacheKey(" LeChe ", 5), "search:leche:5");
		assert.equal(buildProductDetailCacheKey("7790000000001"), "product:detail:7790000000001");
	});
});
