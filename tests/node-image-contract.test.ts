import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");

test("builds a pinned standalone web runner deterministically", async () => {
	const dockerfile = await read("Dockerfile");

	assert.equal((dockerfile.match(/^FROM node:22\.19\.0-bookworm-slim/gm) ?? []).length, 2);
	assert.match(dockerfile, /^FROM .* AS dependencies$/m);
	assert.match(dockerfile, /^FROM .* AS builder$/m);
	assert.match(dockerfile, /^FROM .* AS runner$/m);
	assert.match(dockerfile, /npm ci --ignore-scripts --no-audit --no-fund/);
	assert.ok(dockerfile.indexOf("npm run db:generate") < dockerfile.indexOf("npm run build"));
	assert.match(dockerfile, /\/app\/\.next\/standalone \.\//);
	assert.match(dockerfile, /\/app\/\.next\/static \.\/\.next\/static/);
	assert.match(dockerfile, /\/app\/public \.\/public/);
});

test("runs as non-root with writable cache and direct Node signal handling", async () => {
	const dockerfile = await read("Dockerfile");

	assert.match(dockerfile, /HOSTNAME=0\.0\.0\.0/);
	assert.match(dockerfile, /PORT=3000/);
	assert.match(dockerfile, /mkdir -p \.next\/cache/);
	assert.match(dockerfile, /chown -R nextjs:nextjs \.next/);
	assert.match(dockerfile, /^USER nextjs$/m);
	assert.match(dockerfile, /^CMD \["node", "server\.js"\]$/m);
	assert.doesNotMatch(dockerfile, /COPY .*\.env|ENV (?:DATABASE_URL|DIRECT_URL|.*SECRET|.*TOKEN)=/);
});

test("keeps required build inputs and excludes local or secret material", async () => {
	const ignored = (await read(".dockerignore")).split(/\r?\n/);

	for (const path of [".git", ".next", "node_modules", "audit", "docs/reports", ".env", ".env.*", "*.pem"]) {
		assert.ok(ignored.includes(path), `${path} must be excluded`);
	}
	for (const path of ["package.json", "package-lock.json", "next.config.ts", "src", "public", "prisma"]) {
		assert.ok(!ignored.includes(path), `${path} must remain in the build context`);
	}
});

test("enables Next standalone output without coupling it to a deployment provider", async () => {
	const config = await read("next.config.ts");

	assert.match(config, /output:\s*["']standalone["']/);
	assert.doesNotMatch(config, /VERCEL|Docker|container/);
});
