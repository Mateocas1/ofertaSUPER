import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { test } from "node:test";

test("static guards inventory mutating workflows and package scripts before cron enablement", async () => {
	const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
		scripts: Record<string, string>;
	};
	const mutatingPackageScripts = Object.keys(packageJson.scripts).filter(
		(scriptName) =>
			/^(ingest|populate|update:prices|db:seed|cleanup:)/.test(scriptName),
	);

	assert.deepEqual(mutatingPackageScripts.sort(), ["db:seed", "ingest"]);
	assert.ok(
		Object.keys(packageJson.scripts).length < 20,
		`package.json must stay under 20 scripts, found ${Object.keys(packageJson.scripts).length}`,
	);
	assert.deepEqual(
		Object.keys(packageJson.scripts).filter((scriptName) =>
			/^(?:scrape|smoke|probe|audit):/.test(scriptName),
		),
		["audit:complexity"],
	);

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
		/direct-refresh:(?:write|prewrite)|direct-refresh-(?:write|prewrite)/i,
	);
	assert.equal(
		workflowEntries.find((entry) => /refresh-existing/i.test(entry.fileName)),
		undefined,
	);
});

test("the unified direct-refresh writer is not scheduled and avoids broad ingestion paths", async () => {
	const writer = await readFile("scripts/direct-refresh-write.ts", "utf8");
	const pipeline = await readFile(
		"scripts/pipeline/direct-refresh-active-write.ts",
		"utf8",
	);

	assert.doesNotMatch(
		writer,
		/reconcileStageProducts|scripts\/ingest|stageSourceProducts/,
	);
	assert.doesNotMatch(writer, /workflow|cron|schedule|deploy|cleanup/);
	assert.match(
		writer,
		/candidateScanSize: prewriteReport\.selection\.candidateScanSize/,
	);
	assert.match(writer, /DIRECT_REFRESH_ACTIVE_WRITE_TRANSACTION_OPTIONS/);
	assert.match(writer, /activeWriteSourceFromArgv\(\)/);
	assert.match(pipeline, /ACTIVE_WRITE_SOURCES/);
});

test("the legacy scraper path no longer exists in the repository", async () => {
	const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
		scripts: Record<string, string>;
	};
	const legacyScripts = Object.keys(packageJson.scripts).filter((scriptName) =>
		/^scrape:/.test(scriptName),
	);
	assert.deepEqual(legacyScripts, []);
	await assert.rejects(readFile("scripts/scrapers/shared.ts", "utf8"));
	await assert.rejects(readFile("scripts/updatePrices.ts", "utf8"));
	await assert.rejects(readFile("scripts/populateDb.ts", "utf8"));
});

test("no script prunes price history by age", async () => {
	// #547 decision: price history is the product, so no script may delete it
	// by timestamp. Only an explicit, id-addressed rollback may remove rows.
	const scriptFiles = ["scripts", "prisma"];
	const sources = await Promise.all(
		scriptFiles.map(async (dir) => {
			const entries = await readdir(dir, { recursive: true });
			return Promise.all(
				entries
					.filter((entry) => /\.(ts|mjs)$/.test(entry))
					.map(async (entry) => ({
						path: `${dir}/${entry}`,
						content: await readFile(`${dir}/${entry}`, "utf8"),
					})),
			);
		}),
	);
	for (const file of sources.flat()) {
		assert.doesNotMatch(
			file.content,
			/priceHistory\.deleteMany\(\s*\{[^}]*scraped_at/,
			`${file.path} must not prune price history by age`,
		);
	}
});

test("no script or app module issues a DELETE against price_history", async () => {
	// #547 decision: price history is never deleted. This guard is stricter
	// than the age check above: any Prisma delete on the model or raw SQL
	// `delete from price_history` in scripts/ or src/ fails it. Migrations are
	// schema history, not runtime scripts, and none of them deletes the table.
	const roots = ["scripts", "src"];
	const sources = await Promise.all(
		roots.map(async (dir) => {
			const entries = await readdir(dir, { recursive: true });
			return Promise.all(
				entries
					.filter((entry) => /\.(ts|mjs)$/.test(entry))
					.map(async (entry) => ({
						path: `${dir}/${entry}`,
						content: await readFile(`${dir}/${entry}`, "utf8"),
					})),
			);
		}),
	);
	for (const file of sources.flat()) {
		assert.doesNotMatch(
			file.content,
			/priceHistory\s*\.\s*(?:delete|deleteMany)\s*\(/,
			`${file.path} must not delete price history`,
		);
		assert.doesNotMatch(
			file.content,
			/delete\s+from\s+(?:[\w".]*\.)?"?price_history"?/i,
			`${file.path} must not delete price history`,
		);
	}

	// The only row DELETE in scripts/ is staging retention, and it targets
	// staging_product. If that changes, the guard test above already fires.
	const retention = await readFile("scripts/pipeline/staging-retention.ts", "utf8");
	assert.match(retention, /delete from staging_product/);
});
