import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";

const image = `ofertasuper-job-smoke:${randomUUID()}`;
const fictionalEnvironment = {
	DATABASE_URL: "postgresql://job:local-only@invalid:5432/ofertasuper",
	VTEX_SHA256_HASH: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
};
let cleaning = false;

function docker(args, capture = false, acceptedStatuses = [0]) {
	const result = spawnSync("docker", args, { encoding: "utf8", stdio: capture ? "pipe" : "inherit" });
	if (result.error) throw result.error;
	if (!acceptedStatuses.includes(result.status)) {
		throw new Error(`docker ${args.join(" ")} failed with status ${result.status}\n${result.stderr ?? ""}`);
	}
	return result;
}

function run(command, environment = []) {
	return docker([
		"run", "--rm", "--network=none", "--read-only",
		"--tmpfs=/tmp:rw,noexec,nosuid,size=16m",
		...Object.entries(fictionalEnvironment).flatMap(([name, value]) => ["--env", `${name}=${value}`]),
		...environment, image, ...command,
	], true);
}

function cleanup() {
	if (cleaning) return;
	cleaning = true;
	docker(["image", "rm", "--force", image], false, [0, 1]);
}

for (const signal of ["SIGINT", "SIGTERM"]) {
	process.once(signal, () => {
		try { cleanup(); } catch (error) { console.error(error); }
		process.exit(128 + (signal === "SIGINT" ? 2 : 15));
	});
}

let primaryFailure;
try {
	docker(["build", "--target", "job", "--tag", image, "."]);
	const identity = run(["node", "-e", "process.stdout.write(`${process.getuid()}:${process.getgid()}`)"]);
	assert.notEqual(identity.stdout.trim(), "0:0");
	const dependencies = run(["node", "-e", [
		"const fs=require('node:fs');",
		"const resolved={tsx:Boolean(require.resolve('tsx')),prismaClient:Boolean(require.resolve('@prisma/client'))};",
		"const packagesAbsent=Object.fromEntries(['prisma','typescript','eslint'].map(name=>[name,!fs.existsSync(`node_modules/${name}`)]));",
		"const binariesAbsent=Object.fromEntries(['prisma','tsc','tsserver','eslint'].map(name=>[name,!fs.existsSync(`node_modules/.bin/${name}`)]));",
		"process.stdout.write(JSON.stringify({resolved,packagesAbsent,binariesAbsent}));",
	].join("")]);
	assert.deepEqual(JSON.parse(dependencies.stdout), {
		resolved: { tsx: true, prismaClient: true },
		packagesAbsent: { prisma: true, typescript: true, eslint: true },
		binariesAbsent: { prisma: true, tsc: true, tsserver: true, eslint: true },
	});
	const preflight = run(["./node_modules/.bin/tsx", "scripts/check-runtime-contract.ts", "job"]);
	assert.equal(preflight.stdout.trim(), "Runtime contract satisfied for role job.");
	const ingestion = run([], ["--env", "INGESTION_V2=off"]);
	assert.deepEqual(JSON.parse(ingestion.stdout), { mode: "off", skipped: true, reason: "INGESTION_V2=off" });
	for (const [name, value] of Object.entries(fictionalEnvironment)) {
		assert.ok(!(preflight.stdout + preflight.stderr).includes(value), `preflight must not expose ${name}`);
		assert.ok(!(ingestion.stdout + ingestion.stderr).includes(value), `disabled ingestion must not expose ${name}`);
	}
	console.log("Job image smoke passed: non-root preflight and disabled ingestion exited under isolated read-only runtime.");
} catch (error) { primaryFailure = error; }

try { cleanup(); } catch (error) {
	primaryFailure = primaryFailure ? new AggregateError([primaryFailure, error], "Job smoke and cleanup failed") : error;
}
if (primaryFailure) throw primaryFailure;
