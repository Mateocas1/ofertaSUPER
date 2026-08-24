import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const name = `ofertasuper-production-readiness-${randomUUID().replaceAll("-", "").slice(0, 12)}`;
let started = false;

function run(command: string, args: string[], env?: NodeJS.ProcessEnv) {
	const result = spawnSync(command, args, { encoding: "utf8", env, stdio: "pipe" });
	if (result.error || result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed: ${result.stderr}`);
	return result.stdout.trim();
}

function sql(statement: string) {
	return run("docker", ["exec", "-i", name, "psql", "-q", "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "ofertasuper", "-c", statement]);
}

function cleanup() {
	if (!started) return;
	started = false;
	run("docker", ["rm", "--force", name]);
}

let failure: unknown;
try {
	run("docker", ["run", "--detach", "--rm", "--name", name, "--publish", "127.0.0.1::5432", "--env", "POSTGRES_DB=ofertasuper", "--env", "POSTGRES_HOST_AUTH_METHOD=trust", "postgres:16-alpine"]);
	started = true;
	for (let attempt = 0; attempt < 30; attempt += 1) {
		try {
			run("docker", ["exec", name, "pg_isready", "-U", "postgres", "-d", "ofertasuper"]);
			break;
		} catch {
			if (attempt === 29) throw new Error("disposable PostgreSQL did not become ready");
			Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
		}
	}
	const port = run("docker", ["port", name, "5432/tcp"]).match(/:(\d+)$/m)?.[1];
	if (!port) throw new Error("disposable PostgreSQL port unavailable");
	const url = `postgresql://postgres@127.0.0.1:${port}/ofertasuper?schema=public`;
	run("npx", ["prisma", "migrate", "deploy"], { ...process.env, DATABASE_URL: url, DIRECT_URL: url });

	assert.equal(sql("BEGIN; INSERT INTO production_readiness_promotions (id, candidate_digest, deployment_id, commit_sha, owner, rollback_authority, expires_at, state, updated_at) VALUES ('pending-smoke', 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'smoke', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'smoke-owner', 'smoke-rollback', CURRENT_TIMESTAMP + interval '1 day', 'PENDING', CURRENT_TIMESTAMP); SELECT state FROM production_readiness_promotions WHERE id = 'pending-smoke'; ROLLBACK;"), "PENDING");
	assert.equal(sql("SELECT count(*) FROM production_readiness_promotions WHERE id = 'pending-smoke'"), "0");
	console.log("Production-readiness repository smoke passed: migrations applied, pending state read, and transaction rollback preserved no record.");
} catch (error) {
	failure = error;
}

try {
	cleanup();
} catch (cleanupError) {
	failure ??= cleanupError;
}
if (failure) throw failure;
