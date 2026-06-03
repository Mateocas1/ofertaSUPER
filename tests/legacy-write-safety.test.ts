import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { test } from "node:test";

import { readDryRunFlag, runStoreScraper } from "../scripts/scrapers/shared";
import type { NormalizedProduct } from "../src/lib/vtex/normalize";

const sampleProduct: NormalizedProduct = {
	ean: "7790000000001",
	name: "Leche Test",
	brand: "TEST",
	description: null,
	imageUrl: null,
	images: [],
	category: "Lacteos",
	skuId: "sku-test",
	sellerId: "seller-test",
	productUrl: "https://example.com/leche-test",
	price: 1200,
	listPrice: 1400,
	referencePrice: null,
	referenceUnit: null,
	isAvailable: true,
};

test("legacy scrapers default to dry-run and reject production freshness writes", () => {
	assert.equal(readDryRunFlag(["node", "script"], {}), true);
	assert.equal(readDryRunFlag(["node", "script", "--confirm-write"], {}), true);
	assert.equal(
		readDryRunFlag(["node", "script", "--confirm-write", "--dry-run"], {}),
		true,
	);
	assert.equal(
		readDryRunFlag(["node", "script"], { INGESTION_WRITE_APPROVED: "true" }),
		true,
	);
	assert.equal(
		readDryRunFlag(["node", "script", "--confirm-write"], {
			INGESTION_WRITE_APPROVED: "true",
			LEGACY_PRICE_WRITE_APPROVED: "true",
		}),
		false,
	);
});

test("runStoreScraper does not persist when dryRun is omitted", async () => {
	let persistCalls = 0;

	const result = await runStoreScraper({
		slug: "disco",
		queryTerms: ["leche"],
		dependencies: {
			getSupermarketBySlug: () => ({
				slug: "disco",
				name: "Disco",
				logoUrl: "https://example.com/logo.png",
				baseUrl: "https://example.com",
				adapter: "vtex",
			}),
			resolveQueryTerms: async () => ["leche"],
			fetchVtexProducts: async () => [sampleProduct],
			persistPricing: async () => {
				persistCalls += 1;
				return { persisted: 1, skipped: 0 };
			},
		},
	});

	assert.equal(persistCalls, 0);
	assert.equal(result.persisted, 0);
	assert.equal(result.fetched, 1);
});

test("static guards inventory mutating workflows and package scripts before cron enablement", async () => {
	const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
		scripts: Record<string, string>;
	};
	const mutatingPackageScripts = Object.keys(packageJson.scripts).filter(
		(scriptName) =>
			/^(ingest|populate|update:prices|db:seed|cleanup:)/.test(scriptName),
	);

	assert.deepEqual(mutatingPackageScripts.sort(), [
		"cleanup:history",
		"cleanup:staging",
		"db:seed",
		"ingest",
		"populate",
		"update:prices",
	]);

	const workflowNames = (await readdir(".github/workflows")).filter(
		(fileName) => fileName.endsWith(".yml") || fileName.endsWith(".yaml"),
	);
	const workflowEntries = await Promise.all(
		workflowNames.map(async (fileName) => ({
			fileName,
			content: await readFile(`.github/workflows/${fileName}`, "utf8"),
		})),
	);
	const allWorkflows = workflowEntries
		.map((entry) => `# ${entry.fileName}\n${entry.content}`)
		.join("\n---\n");
	const mutatingCommandPattern =
		/npm run (?:ingest|update:prices|populate|db:seed|cleanup:[a-z-]+)|\bpsql\b|\bVACUUM\b/i;

	for (const entry of workflowEntries.filter((workflow) =>
		mutatingCommandPattern.test(workflow.content),
	)) {
		assert.match(
			entry.content,
			/workflow_dispatch:/,
			`${entry.fileName} must stay manual-only before cron enablement`,
		);
		assert.doesNotMatch(
			entry.content,
			/^\s*schedule:/m,
			`${entry.fileName} must not define a mutating schedule before enablement`,
		);
	}

	assert.doesNotMatch(
		allWorkflows,
		/INGESTION_ACTIVE_WRITE_APPROVED:\s*["']?true/i,
	);
	assert.doesNotMatch(allWorkflows, /INGESTION_V2:\s*["']?active/i);
	assert.doesNotMatch(
		allWorkflows,
		/direct-refresh:(?:carrefour|vea|disco|jumbo|mas)-write|direct-refresh-(?:carrefour|vea|disco|jumbo|mas)-write/i,
	);
	assert.equal(
		workflowEntries.find((entry) => /refresh-existing/i.test(entry.fileName)),
		undefined,
	);
});

test("active direct-refresh writers are not scheduled and avoid broad ingestion paths", async () => {
	const carrefourWriter = await readFile(
		"scripts/direct-refresh-carrefour-write.ts",
		"utf8",
	);
	const veaWriter = await readFile(
		"scripts/direct-refresh-vea-write.ts",
		"utf8",
	);
	const discoWriter = await readFile(
		"scripts/direct-refresh-disco-write.ts",
		"utf8",
	);
	const jumboWriter = await readFile(
		"scripts/direct-refresh-jumbo-write.ts",
		"utf8",
	);
	const masWriter = await readFile(
		"scripts/direct-refresh-mas-write.ts",
		"utf8",
	);
	const postwriteAudit = await readFile(
		"scripts/audit-direct-refresh-postwrite.ts",
		"utf8",
	);

	for (const writer of [
		carrefourWriter,
		veaWriter,
		discoWriter,
		jumboWriter,
		masWriter,
	]) {
		assert.doesNotMatch(
			writer,
			/reconcileStageProducts|scripts\/ingest|scrapers\/shared|stageSourceProducts/,
		);
		assert.doesNotMatch(writer, /workflow|cron|schedule|deploy|cleanup/);
		assert.match(
			writer,
			/candidateScanSize: prewriteReport\.selection\.candidateScanSize/,
		);
		assert.match(
			writer,
			/DIRECT_REFRESH_ACTIVE_WRITE_TRANSACTION_OPTIONS/,
		);
	}
	assert.doesNotMatch(
		postwriteAudit,
		/direct-refresh-carrefour-write|direct-refresh-vea-write|direct-refresh-disco-write|direct-refresh-jumbo-write|direct-refresh-mas-write|executeCarrefourActiveWrite|executeVeaActiveWrite|executeDiscoActiveWrite|executeJumboActiveWrite|executeMasActiveWrite|reconcileStageProducts|scripts\/ingest|scrapers\/shared|stageSourceProducts/,
	);
});

test("update prices workflow is dry-run only and does not report fake write status", async () => {
	const workflow = await readFile(
		".github/workflows/update-prices.yml",
		"utf8",
	);

	assert.match(workflow, /confirm_write:/);
	assert.match(workflow, /Deprecated legacy path/);
	assert.match(workflow, /--dry-run/);
	assert.doesNotMatch(workflow, /--confirm-write/);
	assert.match(workflow, /LEGACY_PRICE_WRITE_APPROVED: "false"/);
	assert.doesNotMatch(workflow, /report-scraper-status/);
});
