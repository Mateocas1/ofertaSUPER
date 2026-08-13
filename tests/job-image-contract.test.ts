import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");

test("packages the canonical ingestion entrypoint as a non-root job target", async () => {
	const dockerfile = await read("Dockerfile");
	const base = dockerfile.match(/^FROM node:22\.19\.0-bookworm-slim AS openssl-node$([\s\S]*?)(?=^FROM )/m)?.[1];
	const preparation = dockerfile.match(/^FROM dependencies AS job-dependencies$([\s\S]*?)(?=^FROM )/m)?.[1];
	const job = dockerfile.match(/^FROM openssl-node AS job$([\s\S]*?)(?=^FROM )/m)?.[1];
	assert.ok(base, "shared OpenSSL Node base must exist");
	assert.ok(preparation, "job dependency stage must exist");
	assert.ok(job, "job target must exist");
	assert.match(base, /apt-get install --yes --no-install-recommends openssl/);
	assert.match(base, /rm -rf \/var\/lib\/apt\/lists\/\*/);
	assert.match(dockerfile, /^FROM openssl-node AS dependencies$/m);
	assert.ok(
		preparation.indexOf("npm run db:generate") < preparation.indexOf("npm prune --omit=dev"),
		"Prisma generation must precede production pruning",
	);
	assert.ok(
		preparation.indexOf("npm prune --omit=dev") < preparation.indexOf("rm -rf node_modules/prisma"),
		"retained peer tools must be removed after pruning",
	);
	for (const path of ["node_modules/prisma", "node_modules/typescript", "node_modules/eslint", "node_modules/.bin/prisma", "node_modules/.bin/tsc", "node_modules/.bin/tsserver", "node_modules/.bin/eslint"]) {
		assert.ok(preparation.includes(path), `${path} must be removed`);
	}
	assert.match(job, /COPY --from=job-dependencies[^\n]*\/app\/node_modules \.\/node_modules/);
	assert.match(job, /COPY --chown=ingestion:ingestion scripts \.\/scripts/);
	assert.match(job, /COPY --chown=ingestion:ingestion src \.\/src/);
	assert.match(job, /^USER ingestion$/m);
	assert.match(job, /^CMD \["\.\/node_modules\/\.bin\/tsx", "scripts\/ingest\.ts"\]$/m);
	assert.doesNotMatch(job, /npm run ingest|npm (?:ci|prune)|db:generate|ENTRYPOINT|\.env/);
});

test("isolates the disposable runtime proof and always removes its image", async () => {
	const smoke = await read("scripts/job-image-smoke.mjs");
	for (const boundary of ["--network=none", "--read-only", "--tmpfs=/tmp", '"--rm"']) {
		assert.ok(smoke.includes(boundary), `${boundary} must constrain the runtime`);
	}
	assert.match(smoke, /INGESTION_V2=off/);
	assert.match(smoke, /packagesAbsent/);
	assert.match(smoke, /binariesAbsent/);
	assert.match(smoke, /fictionalEnvironment/);
	assert.match(smoke, /check-runtime-contract\.ts", "job"/);
	assert.match(smoke, /image", "rm", "--force"/);
	assert.match(smoke, /\["SIGINT", "SIGTERM"\]/);
});

test("runs only shadow ingestion through the workflow job image", async () => {
	const workflow = await read(".github/workflows/ingest.yml");
	const buildStep = workflow.match(/- name: Build ingestion job image\n((?:\s{8,}.*\n?)+)/)?.[1] ?? "";
	const runStep = workflow.match(/- name: Run shadow ingestion in job image\n([\s\S]*?)(?=\n\s{6}- name:)/)?.[1] ?? "";

	assert.match(buildStep, /docker build --target job --tag ofertas-super-ingestion-job \./);
	assert.doesNotMatch(buildStep, /--build-arg/);
	assert.match(runStep, /docker run --rm/);
	assert.doesNotMatch(runStep, /npm run ingest|tsx scripts\/ingest\.ts/);
	assert.match(runStep, /--env INGESTION_V2[\s\\]+ofertas-super-ingestion-job\s*$/m);

	for (const name of [
		"DATABASE_URL",
		"DIRECT_URL",
		"VTEX_SHA256_HASH",
		"UPSTASH_REDIS_REST_URL",
		"UPSTASH_REDIS_REST_TOKEN",
		"SCRAPER_ALERT_WEBHOOK_URL",
		"INGESTION_V2",
	]) {
		assert.match(runStep, new RegExp(`--env ${name}(?:\\s|\\\\)`));
		assert.doesNotMatch(runStep, new RegExp(`--env ${name}=`));
	}

	assert.match(runStep, /INGESTION_V2: shadow/);
	assert.doesNotMatch(workflow, /^\s*schedule:/m);
});
