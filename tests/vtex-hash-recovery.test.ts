import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import {
	discoverVtexHash,
	extractVtexHashCandidates,
} from "../src/lib/vtex/hash-discovery";
import {
	handleVtexHashUnavailable,
	resolveVtexHash,
	resolveVtexHashForSource,
	sendVtexHashUnavailableAlert,
	VtexHashUnavailableError,
} from "../src/lib/vtex/hash-resolution";

const FIXTURE = new URL("fixtures/vtex/storefront-registry.html", import.meta.url);
const baseUrl = "https://www.sanitized-store.com.ar";

const hash = (digit: string) => digit.repeat(64);
const runtimeScript = (cacheHints: Record<string, unknown>) =>
	`<html><body><script>${JSON.stringify({ account: "sanitized-store", cacheHints })}</script></body></html>`;

async function fixtureHtml() {
	return readFile(FIXTURE, "utf8");
}

describe("VTEX persisted-query registry parsing", () => {
	it("extracts only search-graphql hashes and orders the product-suggestion sender first", async () => {
		const candidates = extractVtexHashCandidates(await fixtureHtml());

		assert.deepEqual(
			candidates.map((entry) => entry.hash),
			[hash("2"), hash("3"), hash("6"), hash("7"), hash("4")],
		);
		assert.equal(candidates[0].sender, "vtex.store-resources@0.x");
		assert.equal(candidates.at(-1)?.sender, "vtex.wish-list@1.x");
	});

	it("ignores non-search-graphql providers, malformed keys and stores without a registry", () => {
		const candidates = extractVtexHashCandidates(
			runtimeScript({
				[hash("9")]: { provider: "vtex.search-graphql@0.x", sender: "vtex.shelf@1.x" },
				[hash("8")]: { provider: "vtex.search-graphql@0.x", sender: "vtex.store-resources@0.x" },
				[hash("7")]: { provider: "vtex.catalog-graphql@1.x", sender: "vtex.store-resources@0.x" },
				"not-a-hash": { provider: "vtex.search-graphql@0.x", sender: "vtex.store-resources@0.x" },
			}),
		);

		assert.deepEqual(
			candidates.map((entry) => entry.hash),
			[hash("8"), hash("9")],
		);
		assert.deepEqual(extractVtexHashCandidates("<html><body>nothing</body></html>"), []);
	});
});

describe("VTEX hash discovery", () => {
	it("validates candidates in order and returns the first accepted one", async () => {
		const seen: string[] = [];
		const discovered = await discoverVtexHash({
			baseUrl,
			dependencies: {
				fetchStorefront: fixtureHtml,
				validateCandidate: async (entry) => {
					seen.push(entry.hash);
					return entry.hash === hash("3");
				},
			},
		});

		assert.deepEqual(seen, [hash("2"), hash("3")]);
		assert.equal(discovered?.hash, hash("3"));
	});

	it("returns null when every candidate is rejected", async () => {
		const discovered = await discoverVtexHash({
			baseUrl,
			dependencies: {
				fetchStorefront: fixtureHtml,
				validateCandidate: async () => false,
			},
		});

		assert.equal(discovered, null);
	});
});

describe("VTEX hash resolution order", () => {
	it("keeps a valid explicit hash without probing the last known one or discovering", async () => {
		let discovered = 0;
		const resolved = await resolveVtexHash({
			baseUrl,
			explicitHash: hash("a"),
			lastKnownHash: hash("b"),
			dependencies: {
				probe: async (value) => value === hash("a"),
				discover: async () => {
					discovered += 1;
					return hash("c");
				},
			},
		});

		assert.deepEqual(resolved, { hash: hash("a"), source: "explicit" });
		assert.equal(discovered, 0);
	});

	it("falls back to a valid last-known hash when the explicit one rotated", async () => {
		const probes: string[] = [];
		const resolved = await resolveVtexHash({
			baseUrl,
			explicitHash: hash("a"),
			lastKnownHash: hash("b"),
			dependencies: {
				probe: async (value) => {
					probes.push(value);
					return value === hash("b");
				},
				discover: async () => hash("c"),
			},
		});

		assert.deepEqual(probes, [hash("a"), hash("b")]);
		assert.deepEqual(resolved, { hash: hash("b"), source: "last_known" });
	});

	it("rediscovers when both the explicit and the last-known hash are invalid", async () => {
		const resolved = await resolveVtexHash({
			baseUrl,
			explicitHash: hash("a"),
			lastKnownHash: hash("b"),
			dependencies: {
				probe: async () => false,
				discover: async () => hash("c"),
			},
		});

		assert.deepEqual(resolved, { hash: hash("c"), source: "discovered" });
	});

	it("reads the last known hash for that source before resolving", async () => {
		const read: string[] = [];
		const resolved = await resolveVtexHashForSource({
			source: "disco",
			baseUrl,
			explicitHash: hash("a"),
			readLastKnownHash: async (source) => {
				read.push(source);
				return hash("b");
			},
			dependencies: {
				probe: async (value) => value === hash("b"),
				discover: async () => hash("c"),
			},
		});

		assert.deepEqual(read, ["disco"]);
		assert.deepEqual(resolved, { hash: hash("b"), source: "last_known" });
	});

	it("fails with a greppable message when no valid hash can be obtained", async () => {
		await assert.rejects(
			resolveVtexHash({
				baseUrl,
				explicitHash: hash("a"),
				lastKnownHash: hash("b"),
				dependencies: { probe: async () => false, discover: async () => null },
			}),
			(error: unknown) => {
				assert.ok(error instanceof VtexHashUnavailableError);
				assert.match(error.message, /VTEX_HASH_UNAVAILABLE/);
				assert.match(error.message, /sanitized-store/);
				return true;
			},
		);
	});
});

describe("VTEX hash alerting", () => {
	it("posts a VTEX_HASH_UNAVAILABLE alert to the existing webhook channel", async () => {
		const calls: Array<{ url: string; body: string }> = [];
		const sent = await sendVtexHashUnavailableAlert({
			baseUrl,
			details: ["disco: no candidate validated"],
			webhookUrl: "https://alerts.example.com/hook",
			fetchImpl: async (url, init) => {
				calls.push({ url: String(url), body: String(init?.body ?? "") });
				return new Response("ok", { status: 200 });
			},
		});

		assert.equal(sent, true);
		assert.equal(calls.length, 1);
		assert.equal(calls[0].url, "https://alerts.example.com/hook");
		assert.match(calls[0].body, /VTEX_HASH_UNAVAILABLE/);
		assert.match(calls[0].body, /disco: no candidate validated/);
	});

	it("stays silent when no webhook is configured and never throws on webhook failure", async () => {
		const previous = process.env.SCRAPER_ALERT_WEBHOOK_URL;
		delete process.env.SCRAPER_ALERT_WEBHOOK_URL;
		let called = 0;
		try {
			const skipped = await sendVtexHashUnavailableAlert({
				baseUrl,
				fetchImpl: async () => {
					called += 1;
					return new Response("ok", { status: 200 });
				},
			});
			assert.equal(skipped, false);
			assert.equal(called, 0);

			const failed = await sendVtexHashUnavailableAlert({
				baseUrl,
				webhookUrl: "https://alerts.example.com/hook",
				fetchImpl: async () => {
					throw new Error("network down");
				},
			});
			assert.equal(failed, false);
		} finally {
			if (previous === undefined) delete process.env.SCRAPER_ALERT_WEBHOOK_URL;
			else process.env.SCRAPER_ALERT_WEBHOOK_URL = previous;
		}
	});

	it("reports the failure with exit code 1 so the cron does not publish", async () => {
		const logged: string[] = [];
		const alerts: string[] = [];
		const error = new VtexHashUnavailableError(baseUrl);
		const code = await handleVtexHashUnavailable(error, {
			log: (message) => logged.push(message),
			alert: async (message) => {
				alerts.push(message);
				return true;
			},
		});

		assert.equal(code, 1);
		assert.deepEqual(logged, [error.message]);
		assert.deepEqual(alerts, [error.message]);
	});
});
