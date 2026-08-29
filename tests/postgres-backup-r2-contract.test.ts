import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { PassThrough } from "node:stream";
import test from "node:test";
import { createBackupPlan, createRuntime, cryptProbeEnvironment, formatManifestBasename, redact, runBackup, selectOwnedPairs } from "../scripts/postgres-backup-r2.mjs";

const root = new URL("../", import.meta.url), read = (path: string) => readFileSync(new URL(path, root), "utf8");
const env = { PATH: "/runtime-bin", DATABASE_URL: "postgresql://backup_user:secret-password@db.example:6543/catalog?sslmode=require", BACKUP_CRYPT_REMOTE: "crypt:ofertasuper-r2", RCLONE_CONFIG_CRYPT_REMOTE: "r2:bucket", BACKUP_RETENTION: "2", BACKUP_DATABASE_ROLE: "backup_user", PG_IMAGE: "postgres:17.6-bookworm@sha256:f3bd19c606e442c3d7bdfa8002e03fe260a1023351e0ea4598032022b68dd6e3" };
const count = (text: string, value: string) => text.split(value).length - 1;

function assertFixedR2NoCheckBucket(workflow: string) {
  const required = '      RCLONE_CONFIG_R2_NO_CHECK_BUCKET: "true"';
  assert.equal((workflow.match(/^      RCLONE_CONFIG_R2_NO_CHECK_BUCKET:\s*"true"\s*$/gm) || []).length, 1);
  assert.doesNotMatch(workflow, /^      RCLONE_CONFIG_R2_NO_CHECK_BUCKET:\s*\$\{\{/m);
  for (const invalid of ["", "false", '"false"', "${{ vars.R2_NO_CHECK_BUCKET }}"]) assert.throws(() => assert.equal((workflow.replace(required, `      RCLONE_CONFIG_R2_NO_CHECK_BUCKET: ${invalid}`).match(/^      RCLONE_CONFIG_R2_NO_CHECK_BUCKET:\s*"true"\s*$/gm) || []).length, 1));
}

function assertRuntimeCryptPasswordDerivation(workflow: string) {
  const heading = "      - name: Derive rclone crypt passwords\n", start = workflow.indexOf(heading), nextStep = workflow.indexOf("\n      - ", start + heading.length);
  assert.ok(start >= 0 && nextStep > start); assert.equal(count(workflow, heading), 1);
  const step = workflow.slice(start, nextStep), run = "        run: |\n", runStart = step.indexOf(run);
  assert.ok(runStart >= 0); const body = step.slice(runStart + run.length), guardStart = body.indexOf("if [[ "), guardEnd = body.indexOf(" ]]; then", guardStart);
  assert.ok(guardStart >= 0 && guardEnd > guardStart); const guard = body.slice(guardStart, guardEnd + " ]]; then".length);
  const bindings = [["RCLONE_CRYPT_PASSWORD_PLAINTEXT", "RCLONE_CRYPT_PASSWORD", "${{ secrets.RCLONE_CRYPT_PASSWORD }}", "primary_crypt_password"], ["RCLONE_CRYPT_PASSWORD2_PLAINTEXT", "RCLONE_CRYPT_PASSWORD2", "${{ secrets.RCLONE_CRYPT_PASSWORD2 }}", "secondary_crypt_password"]] as const;
  const job = workflow.slice(0, workflow.indexOf("    steps:\n"));
  for (const [plaintext, secretName, secret, obscured] of bindings) {
    const secretBinding = new RegExp(`\\$\\{\\{\\s*secrets\\.${secretName}\\s*\\}\\}`, "g");
    assert.equal((workflow.match(secretBinding) || []).length, 1); assert.equal((step.match(secretBinding) || []).length, 1); assert.ok(step.includes(`          ${plaintext}: ${secret}\n`)); assert.equal((job.match(secretBinding) || []).length, 0);
    assert.doesNotMatch(workflow, new RegExp(`^\\s+${plaintext.replace("_PLAINTEXT", "")}:\\s*\\$\\{\\{\\s*secrets\\.`, "m"));
    assert.ok(guard.includes(`-z "$${plaintext}"`)); assert.ok(guard.includes(`"$${plaintext}" == *$'\\n'*`)); assert.ok(guard.includes(`"$${plaintext}" == *$'\\r'*`));
    const obscure = `${obscured}="$(printf '%s' "$${plaintext}" | "$RUNNER_TEMP/rclone" obscure -)"`;
    assert.equal(count(body, obscure), 1);
    const plaintextReference = new RegExp(`\\$(?:${plaintext}\\b|\\{${plaintext}\\})`);
    assert.deepEqual(body.split("\n").filter((line) => plaintextReference.test(line)).map((line) => line.trim()), [guard.trim(), obscure]);
  }
  const masks = ["printf '::add-mask::%s\\n' \"$primary_crypt_password\"", "printf '::add-mask::%s\\n' \"$secondary_crypt_password\""], writes = ["printf 'RCLONE_CONFIG_CRYPT_PASSWORD=%s\\n' \"$primary_crypt_password\" >> \"$GITHUB_ENV\"", "printf 'RCLONE_CONFIG_CRYPT_PASSWORD2=%s\\n' \"$secondary_crypt_password\" >> \"$GITHUB_ENV\""];
  for (const command of [...masks, ...writes]) assert.equal(count(body, command), 1);
  assert.equal(count(body, "$GITHUB_ENV"), writes.length); assert.ok(Math.max(...masks.map((command) => body.indexOf(command))) < Math.min(...writes.map((command) => body.indexOf(command))));
}

type Call = { program: string; args: string[]; input?: string; env?: Record<string, string> };
type MockOptions = { results?: { stdout: string; bytes: number; sha256: string }[]; fail?: string | ((program: string, args: string[], env?: Record<string, string>) => boolean); streamFailure?: "source" | "destination"; error?: string; files?: string[]; version?: string };
type SpawnOptions = { timeout?: number; killSignal?: string };
const settles = (promise: Promise<unknown>) => {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("child settlement timed out")), 100); })]).finally(() => clearTimeout(timer));
};

function mockOutput(args: string[], options: MockOptions) {
  if (args[0] === "version") return options.version || "rclone v1.75.0\n";
  if (args[0] === "lsf") return (options.files || []).join("\n");
  if (args[0] === "cryptdecode") return `${args[2]}\tencrypted/archive\n`;
  if (args[0] === "hashsum") return `${"b".repeat(64)}  ${args[2]}\n`;
  return "";
}
function mockRuntime(options: MockOptions = {}) {
  const calls: Call[] = [], results = options.results || [{ stdout: "", bytes: 3, sha256: "a".repeat(64) }, { stdout: "archive contents\n", bytes: 3, sha256: "a".repeat(64) }];
  const fails = (program: string, args: string[], environment?: Record<string, string>) => typeof options.fail === "function" ? options.fail(program, args, environment) : Boolean(options.fail && args.join(" ").includes(options.fail));
  return { calls, runtime: {
    command: async (program: string, args: string[], input: { input?: string; env?: Record<string, string> } = {}) => {
      calls.push({ program, args, ...input });
      if (fails(program, args, input.env)) throw new Error(options.error || `${typeof options.fail === "string" ? options.fail : args[0]} failed`);
      return { stdout: mockOutput(args, options) };
    },
    pipeline: async (source: Call, destination: Call, input: { env?: Record<string, string> } = {}) => {
      calls.push({ ...source, env: input.env }, { ...destination, env: input.env });
      if (options.fail === "stream" || options.streamFailure) throw new Error(`backup ${options.streamFailure || "source"} stream command failed`);
      return results.shift()!;
    },
  }};
}

function assertPublicSchemaDumpArgs(args: string[]) {
  assert.deepEqual(args, [
    "run", "--rm", "-i", "--env", "PGHOST", "--env", "PGPORT", "--env", "PGUSER", "--env", "PGPASSWORD", "--env", "PGDATABASE", "--env", "PGSSLMODE",
    env.PG_IMAGE, "pg_dump", "--format=custom", "--no-owner", "--no-acl", "--lock-wait-timeout=30s", "--schema=public",
  ]);
}

test("plans only a direct role and redacts the URL", () => {
  const plan = createBackupPlan(env, new Date("2026-03-01T02:03:04Z"), "abcdef123456");
  assert.equal(plan.pg.PGUSER, "backup_user");
  assert.throws(() => createBackupPlan({ ...env, BACKUP_DATABASE_ROLE: "other" }), /BACKUP_DATABASE_ROLE/);
  assert.throws(() => createBackupPlan({ ...env, BACKUP_CRYPT_REMOTE: "r2:plain" }), /crypt/);
  assert.doesNotMatch(redact(env.DATABASE_URL), /secret-password|db\.example/);
});

test("retention ignores incomplete newer objects and deletes only old complete pairs", () => {
  const complete = (stamp: string, id: string) => [`postgres-r2-${stamp}-${id}.dump`, `postgres-r2-${stamp}-${id}.manifest.json`];
  const files = ["postgres-r2-20260401T020304Z-abcdef123456.dump", ...complete("20260301T020304Z", "bbcdef123456"), ...complete("20260201T020304Z", "cbcdef123456"), ...complete("20260101T020304Z", "dbcdef123456"), "foreign.txt"];
  assert.deepEqual(selectOwnedPairs(files, 2), complete("20260101T020304Z", "dbcdef123456"));
});

test("builds crypt probe environments from a minimal allowlist without mutating the source", () => {
  const source = { PATH: "/crypt-probe-bin", HOME: "/crypt-probe-home", RCLONE_CONFIG: "/inherited/rclone.conf", RCLONE_CONFIG_R2_ACCESS_KEY_ID: "r2-access-key", RCLONE_CONFIG_R2_SECRET_ACCESS_KEY: "r2-secret-key", RCLONE_CONFIG_CRYPT_PASSWORD2: "secondary-secret", DATABASE_URL: "postgresql://database-secret", GITHUB_ENV: "/github/env", PGHOST: "database-host", UNRELATED: "not-for-probe" };
  const original = { ...source }, primary = cryptProbeEnvironment(source, "primary-candidate"), secondary = cryptProbeEnvironment(source, "secondary-candidate"), withoutHome = cryptProbeEnvironment({ ...source, HOME: undefined }, "without-home-candidate");
  const expectedKeys = ["HOME", "PATH", "RCLONE_CONFIG", "RCLONE_CONFIG_CRYPTPROBE_TYPE", "RCLONE_CONFIG_CRYPT_PASSWORD", "RCLONE_CONFIG_CRYPT_REMOTE", "RCLONE_CONFIG_CRYPT_TYPE"];
  assert.deepEqual(Object.keys(primary).sort(), expectedKeys); assert.deepEqual(Object.keys(secondary).sort(), expectedKeys); assert.deepEqual(Object.keys(withoutHome).sort(), expectedKeys.filter((name) => name !== "HOME"));
  for (const [probe, candidate] of [[primary, "primary-candidate"], [secondary, "secondary-candidate"]] as const) {
    assert.equal(probe.PATH, source.PATH); assert.equal(probe.HOME, source.HOME); assert.equal(probe.RCLONE_CONFIG, "/dev/null"); assert.equal(probe.RCLONE_CONFIG_CRYPT_TYPE, "crypt"); assert.equal(probe.RCLONE_CONFIG_CRYPT_REMOTE, "cryptprobe:"); assert.equal(probe.RCLONE_CONFIG_CRYPTPROBE_TYPE, "local"); assert.equal(probe.RCLONE_CONFIG_CRYPT_PASSWORD, candidate);
  }
  assert.notStrictEqual(primary, secondary); assert.notEqual(primary.RCLONE_CONFIG_CRYPT_PASSWORD, secondary.RCLONE_CONFIG_CRYPT_PASSWORD); assert.deepEqual(source, original);
  assert.throws(() => cryptProbeEnvironment({ ...source, PATH: "" }, "missing-path-candidate"), /PATH is required/);
});

test("preflights raw R2 then each crypt secret in isolated local-backed environments", async () => {
  const raw = mockRuntime({ fail: (_program, args) => args[0] === "lsf" && args.at(-1) === env.RCLONE_CONFIG_CRYPT_REMOTE, error: "raw-r2-secret r2:bucket" });
  await assert.rejects(runBackup({ ...env }, raw.runtime), (error: Error) => { assert.match(error.message, /^R2 credential preflight failed$/); assert.doesNotMatch(error.message, /raw-r2-secret|r2:bucket/); return true; });
  assert.deepEqual(raw.calls.map(({ program, args }) => [program, args]), [["rclone", ["version"]], ["rclone", ["lsf", "--max-depth", "1", "r2:bucket"]]]);

  const input = { ...env, PATH: "/crypt-probe-bin", HOME: "/crypt-probe-home", RCLONE_CONFIG: "/inherited/rclone.conf", RCLONE_CONFIG_CRYPT_PASSWORD: "primary-crypt-password", RCLONE_CONFIG_CRYPT_PASSWORD2: "secondary-crypt-password", RCLONE_CONFIG_R2_ACCESS_KEY_ID: "r2-access-key", RCLONE_CONFIG_R2_SECRET_ACCESS_KEY: "r2-secret-key", GITHUB_ENV: "/github/env", PGHOST: "database-host", UNRELATED: "not-for-probe" };
  const primary = mockRuntime({ fail: (_program, args, probeEnv) => args[0] === "backend" && probeEnv?.RCLONE_CONFIG_CRYPT_PASSWORD === input.RCLONE_CONFIG_CRYPT_PASSWORD, error: "primary-crypt-password crypt:" });
  await assert.rejects(runBackup({ ...input }, primary.runtime), (error: Error) => { assert.match(error.message, /^primary crypt secret preflight failed$/); assert.doesNotMatch(error.message, /primary-crypt-password|secondary-crypt-password|crypt:|r2-access-key/); return true; });
  assert.equal(primary.calls.length, 3);

  const secondary = mockRuntime({ fail: (_program, args, probeEnv) => args[0] === "backend" && probeEnv?.RCLONE_CONFIG_CRYPT_PASSWORD === input.RCLONE_CONFIG_CRYPT_PASSWORD2, error: "secondary-crypt-password crypt:" });
  await assert.rejects(runBackup({ ...input }, secondary.runtime), (error: Error) => { assert.match(error.message, /^secondary crypt secret preflight failed$/); assert.doesNotMatch(error.message, /primary-crypt-password|secondary-crypt-password|crypt:|r2-access-key/); return true; });
  assert.deepEqual(secondary.calls.map(({ program, args }) => [program, args]), [["rclone", ["version"]], ["rclone", ["lsf", "--max-depth", "1", "r2:bucket"]], ["rclone", ["backend", "features", "crypt:"]], ["rclone", ["backend", "features", "crypt:"]]]);
  const rawEnv = secondary.calls[1].env!, primaryEnv = secondary.calls[2].env!, secondaryEnv = secondary.calls[3].env!;
  assert.equal(rawEnv.RCLONE_CONFIG_CRYPT_REMOTE, "r2:bucket"); assert.equal(rawEnv.RCLONE_CONFIG_CRYPTPROBE_TYPE, undefined);
  const probeKeys = ["HOME", "PATH", "RCLONE_CONFIG", "RCLONE_CONFIG_CRYPTPROBE_TYPE", "RCLONE_CONFIG_CRYPT_PASSWORD", "RCLONE_CONFIG_CRYPT_REMOTE", "RCLONE_CONFIG_CRYPT_TYPE"];
  for (const [probeEnv, candidate] of [[primaryEnv, input.RCLONE_CONFIG_CRYPT_PASSWORD], [secondaryEnv, input.RCLONE_CONFIG_CRYPT_PASSWORD2]] as const) {
    assert.notStrictEqual(probeEnv, rawEnv); assert.deepEqual(Object.keys(probeEnv).sort(), probeKeys); assert.equal(probeEnv.PATH, input.PATH); assert.equal(probeEnv.HOME, input.HOME);
    assert.equal(probeEnv.RCLONE_CONFIG, "/dev/null"); assert.equal(probeEnv.RCLONE_CONFIG_CRYPT_TYPE, "crypt"); assert.equal(probeEnv.RCLONE_CONFIG_CRYPT_REMOTE, "cryptprobe:"); assert.equal(probeEnv.RCLONE_CONFIG_CRYPTPROBE_TYPE, "local"); assert.equal(probeEnv.RCLONE_CONFIG_CRYPT_PASSWORD, candidate);
  }
  assert.equal(input.RCLONE_CONFIG_CRYPT_PASSWORD, "primary-crypt-password"); assert.equal(input.RCLONE_CONFIG_CRYPT_PASSWORD2, "secondary-crypt-password");
});

test("streams, verifies bytes/hash/listing, then atomically publishes both halves", async () => {
  const { calls, runtime } = mockRuntime({ files: ["postgres-r2-20260101T020304Z-abcdef123456.dump", "postgres-r2-20260101T020304Z-abcdef123456.manifest.json"] });
  const mutable = { ...env, GITHUB_ACTIONS: "true", UNRELATED: "operational-value", RCLONE_CRYPT_REMOTE: "crypt:reserved-collision", RCLONE_CONFIG_CRYPT_PASSWORD: "primary-crypt-canary", RCLONE_CONFIG_CRYPT_PASSWORD2: "secondary-crypt-canary" };
  await runBackup(mutable, runtime, new Date("2026-03-01T02:03:04Z"), "abcdef123456");
  assert.equal(mutable.DATABASE_URL, undefined); assert.equal(mutable.RCLONE_CONFIG_CRYPT_PASSWORD, undefined); assert.equal(mutable.RCLONE_CONFIG_CRYPT_PASSWORD2, undefined);
  const firstUpload = calls.findIndex(({ args }) => args[0] === "rcat" && args.at(-1)?.endsWith(".dump.uploading"));
  const rcloneCalls = calls.filter(({ program }) => program === "rclone");
  assert.deepEqual(rcloneCalls.slice(0, 4).map(({ program, args }) => [program, args]), [["rclone", ["version"]], ["rclone", ["lsf", "--max-depth", "1", "r2:bucket"]], ["rclone", ["backend", "features", "crypt:"]], ["rclone", ["backend", "features", "crypt:"]]]);
  assert.equal(rcloneCalls[4].args[0], "rcat");
  const [rawEnv, primaryProbeEnv, secondaryProbeEnv] = rcloneCalls.slice(1, 4).map(({ env }) => env!);
  assert.ok(rcloneCalls.filter(({ args }) => args[0] !== "backend").every(({ env }) => env === rawEnv)); assert.ok(rcloneCalls.every(({ env }) => env?.RCLONE_CRYPT_REMOTE === undefined)); assert.equal(rawEnv.GITHUB_ACTIONS, "true"); assert.equal(rawEnv.UNRELATED, "operational-value"); assert.equal(rawEnv.RCLONE_CONFIG_CRYPT_PASSWORD, "primary-crypt-canary"); assert.equal(rawEnv.RCLONE_CONFIG_CRYPT_PASSWORD2, "secondary-crypt-canary");
  assert.equal(primaryProbeEnv.RCLONE_CONFIG_CRYPT_PASSWORD, "primary-crypt-canary"); assert.equal(primaryProbeEnv.RCLONE_CONFIG_CRYPT_PASSWORD2, undefined);
  assert.equal(secondaryProbeEnv.RCLONE_CONFIG_CRYPT_PASSWORD, "secondary-crypt-canary"); assert.equal(secondaryProbeEnv.RCLONE_CONFIG_CRYPT_PASSWORD2, undefined);
  assert.equal(calls.some(({ args }) => args[0] === "lsf" && args.includes("--max-depth") && args.at(-1) === "crypt:"), false);
  const remotePaths = calls.filter(({ args }) => ["rcat", "cat", "moveto", "deletefile"].includes(args[0]) || args[0] === "lsf" && args.includes("--files-only")).flatMap(({ args }) => args.filter((arg) => arg.startsWith("crypt:")));
  assert.ok(remotePaths.length > 0 && remotePaths.every((path) => path === env.BACKUP_CRYPT_REMOTE || path.startsWith(`${env.BACKUP_CRYPT_REMOTE}/`)));
  const retentionList = calls.findIndex(({ args }) => args[0] === "lsf" && args.includes("--files-only") && args.at(-1) === env.BACKUP_CRYPT_REMOTE);
  assert.ok(firstUpload >= 0 && retentionList > firstUpload);
  const archiveMove = calls.findIndex(({ args }) => args[0] === "moveto" && args.at(-1)?.endsWith(".dump"));
  const manifestUpload = calls.findIndex(({ args }) => args[0] === "rcat" && args.at(-1)?.includes("manifest.json.uploading"));
  const manifestMove = calls.findIndex(({ args }) => args[0] === "moveto" && args.at(-1)?.endsWith("manifest.json"));
  assert.ok(archiveMove < manifestUpload && manifestUpload < manifestMove);
  assert.ok(calls.filter(({ args }) => args[0] === "moveto").every(({ args }) => args.includes("--immutable")));
  assert.match(calls[manifestUpload].input!, /"schemaVersion":2.*"bytes":3.*"sha256":"a{64}".*"ciphertext":\{"key":"encrypted\/archive","sha256":"b{64}"\}/);
  const decode = calls.findIndex(({ args }) => args[0] === "cryptdecode"), hash = calls.findIndex(({ args }) => args[0] === "hashsum");
  assert.ok(archiveMove < decode && decode < hash && hash < manifestUpload);
  assert.deepEqual(calls[hash].args.slice(0, 3), ["hashsum", "SHA-256", "r2:bucket/encrypted/archive"]); assert.ok(calls[hash].args.includes("--download"));
  assert.equal(calls[hash].env?.RCLONE_CONFIG_CRYPT_REMOTE, "r2:bucket"); assert.equal(calls[hash].env?.RCLONE_CONFIG_CRYPTPROBE_TYPE, undefined);
  assert.strictEqual(calls[hash].env, rcloneCalls[1].env);
  const dockerCalls = calls.filter(({ program }) => program === "docker");
  assert.equal(dockerCalls.length, 2);
  assertPublicSchemaDumpArgs(dockerCalls[0].args);
  assert.deepEqual(dockerCalls[1].args, ["run", "--rm", "-i", "--env", "PGHOST", "--env", "PGPORT", "--env", "PGUSER", "--env", "PGPASSWORD", "--env", "PGDATABASE", "--env", "PGSSLMODE", env.PG_IMAGE, "pg_restore", "--list"]);
  assert.ok(calls.every(({ args }) => !args.some((arg) => [env.DATABASE_URL, "backup_user", "secret-password", "db.example", "6543", "catalog"].includes(arg))));
});

test("enforces the exact public-schema pg_dump command", async () => {
  const { calls, runtime } = mockRuntime();
  await runBackup({ ...env }, runtime);
  const dumpArgs = calls.find(({ program, args }) => program === "docker" && args.includes("pg_dump"))!.args;
  assertPublicSchemaDumpArgs(dumpArgs);
  const invalidCases: Array<[string, string[]]> = [
    ["missing public", dumpArgs.filter((arg) => arg !== "--schema=public")],
    ["wildcard", dumpArgs.map((arg) => arg === "--schema=public" ? "--schema=*" : arg)],
    ["all", dumpArgs.map((arg) => arg === "--schema=public" ? "--schema=all" : arg)],
    ["auth", dumpArgs.map((arg) => arg === "--schema=public" ? "--schema=auth" : arg)],
    ["storage", dumpArgs.map((arg) => arg === "--schema=public" ? "--schema=storage" : arg)],
    ["extra schema selector", [...dumpArgs, "--schema=auth"]],
    ["missing lock timeout", dumpArgs.filter((arg) => arg !== "--lock-wait-timeout=30s")],
    ["wrong lock timeout", dumpArgs.map((arg) => arg === "--lock-wait-timeout=30s" ? "--lock-wait-timeout=29s" : arg)],
    ["unbounded lock timeout", dumpArgs.map((arg) => arg === "--lock-wait-timeout=30s" ? "--lock-wait-timeout=0" : arg)],
    ["serializable deferrable", [...dumpArgs, "--serializable-deferrable"]],
  ];
  for (const [name, invalidArgs] of invalidCases) assert.throws(() => assertPublicSchemaDumpArgs(invalidArgs), name);
});

test("rejects bad, empty, or mismatched restored archives before publication", async () => {
  for (const restored of [{ stdout: "", bytes: 3, sha256: "a".repeat(64) }, { stdout: "list", bytes: 0, sha256: "a".repeat(64) }, { stdout: "list", bytes: 4, sha256: "b".repeat(64) }]) {
    const { calls, runtime } = mockRuntime({ results: [{ stdout: "", bytes: 3, sha256: "a".repeat(64) }, restored] });
    await assert.rejects(runBackup({ ...env }, runtime), /validation|integrity/);
    assert.equal(calls.some(({ args }) => args[0] === "moveto"), false);
    assert.ok(calls.some(({ args }) => args[0] === "deletefile" && args.at(-1)?.endsWith(".dump.uploading")));
  }
});

test("fails closed after a pg_dump lock timeout and preserves source failure during cleanup", async () => {
  const failed = mockRuntime({ streamFailure: "source", fail: (_program, args) => args[0] === "deletefile" });
  await assert.rejects(runBackup({ ...env }, failed.runtime, new Date("2026-03-01T02:03:04Z"), "abcdef123456"), (error: unknown) => {
    assert.ok(error instanceof AggregateError);
    assert.equal(error.message, "backup source stream command failed");
    assert.equal(error.errors.length, 2);
    assert.equal((error.errors[0] as Error).message, "backup source stream command failed");
    assert.equal((error.errors[1] as Error).message, "deletefile failed");
    assert.doesNotMatch([error.message, ...error.errors.map((failure) => String((failure as Error).message))].join("\n"), /secret-password|db\.example|lock timeout/i);
    return true;
  });
  assertPublicSchemaDumpArgs(failed.calls.find(({ program, args }) => program === "docker" && args.includes("pg_dump"))!.args);
  assert.equal(failed.calls.some(({ args }) => args[0] === "moveto"), false);
  assert.equal(failed.calls.some(({ args }) => args[0] === "rcat" && args.at(-1)?.includes("manifest.json")), false);
  assert.deepEqual(failed.calls.filter(({ args }) => args[0] === "deletefile").map(({ args }) => args.at(-1)), [`${env.BACKUP_CRYPT_REMOTE}/postgres-r2-20260301T020304Z-abcdef123456.dump.uploading`]);
});

test("cleans temporary and final candidates after ambiguous promotions", async () => {
  const temporary = mockRuntime({ fail: (_program, args) => args[0] === "rcat" && Boolean(args.at(-1)?.endsWith("manifest.json.uploading")) });
  await assert.rejects(runBackup({ ...env }, temporary.runtime), /rcat failed/);
  assert.ok(temporary.calls.some(({ args }) => args[0] === "deletefile" && args.at(-1)?.endsWith(".dump")));
  assert.ok(temporary.calls.some(({ args }) => args[0] === "deletefile" && args.at(-1)?.endsWith("manifest.json.uploading")));
  for (const final of [".dump", ".manifest.json"]) {
    const promotion = mockRuntime(), command = promotion.runtime.command;
    promotion.runtime.command = async (...input: Parameters<typeof command>) => {
      if (input[1][0] === "moveto" && input[1].at(-1)?.endsWith(final)) throw new Error("promotion failed");
      return command(...input);
    };
    await assert.rejects(runBackup({ ...env }, promotion.runtime), /promotion failed/);
    assert.ok(promotion.calls.some(({ args }) => args[0] === "deletefile" && args.at(-1)?.endsWith(final)));
  }
  const aggregate = mockRuntime({ fail: (_program, args) => args[0] === "deletefile" || args[0] === "rcat" && Boolean(args.at(-1)?.endsWith("manifest.json.uploading")) });
  await assert.rejects(runBackup({ ...env }, aggregate.runtime), (error: Error) => { assert.ok(error instanceof AggregateError); assert.match(error.message, /rcat failed/); return true; });
  assert.equal(aggregate.calls.filter(({ args }) => args[0] === "deletefile").length, 2);
});

test("pipeline has bounded children, force-kills peers, and settles once", async () => {
  const child = () => Object.assign(new EventEmitter(), { stdout: new PassThrough(), stdin: new PassThrough(), stderr: new PassThrough(), killed: false, kills: [] as string[], kill(signal?: string) { this.killed = true; this.kills.push(signal || ""); return true; } });
  const source = child(), destination = child(), spawned: [unknown, unknown, SpawnOptions][] = [];
  const pending = createRuntime(((program: unknown, args: unknown, options: SpawnOptions) => { spawned.push([program, args, options]); return spawned.length === 1 ? source : destination; }) as never).pipeline({ program: "source", args: ["source-secret"] }, { program: "destination", args: ["destination-secret"] });
  destination.emit("error", new Error("destination error")); destination.emit("close", 1); source.emit("close", null, "SIGKILL");
  await assert.rejects(settles(pending), (error: Error) => { assert.match(error.message, /^backup destination stream command failed$/); assert.doesNotMatch(error.message, /secret/); return true; });
  assert.deepEqual(source.kills, ["SIGKILL"]); assert.ok(source.stderr.listenerCount("data") && destination.stderr.listenerCount("data"));
  assert.ok(spawned.every(([, , options]) => options.timeout && options.timeout > 0 && options.killSignal === "SIGKILL"));
  const failedSource = child(), stoppedDestination = child(); let sourceCount = 0, settlements = 0;
  const sourceFirst = createRuntime((() => sourceCount++ ? stoppedDestination : failedSource) as never).pipeline({ program: "source", args: [] }, { program: "destination", args: [] });
  void sourceFirst.then(() => { settlements += 1; }, () => { settlements += 1; });
  failedSource.emit("error", new Error("source error")); failedSource.emit("close", 1); stoppedDestination.emit("close", null, "SIGKILL");
  await assert.rejects(settles(sourceFirst), /^Error: backup source stream command failed$/); assert.equal(settlements, 1); assert.deepEqual(stoppedDestination.kills, ["SIGKILL"]);
  const synchronousThrow = createRuntime((() => { throw new Error("source spawn failed"); }) as never).pipeline({ program: "source", args: [] }, { program: "destination", args: [] });
  await assert.rejects(settles(synchronousThrow), /^Error: backup source stream command failed$/);
});

test("synchronous commands use a finite timeout", async () => {
  let options: SpawnOptions | undefined;
  const runtime = createRuntime(undefined, ((_program: string, _args: string[], input: SpawnOptions) => { options = input; return { status: 0, stdout: "" }; }) as never);
  await runtime.command("rclone", ["version"]);
  assert.ok(options?.timeout && options.timeout > 0); assert.equal(options?.killSignal, "SIGKILL");
});

test("rejects a mismatched rclone before upload and preserves a published pair on retention failure", async () => {
  const mismatch = mockRuntime({ version: "rclone v1.74.0\n" });
  await assert.rejects(runBackup({ ...env }, mismatch.runtime), /version pin/);
  assert.deepEqual(mismatch.calls.map(({ program, args }) => [program, args]), [["rclone", ["version"]]]);
  const pair = (stamp: string, id: string) => [`postgres-r2-${stamp}-${id}.dump`, `postgres-r2-${stamp}-${id}.manifest.json`];
  const retention = mockRuntime({ files: [...pair("20260401T020304Z", "111111111111"), ...pair("20260301T020304Z", "222222222222"), ...pair("20260101T020304Z", "333333333333")], fail: (_program, args) => args[0] === "deletefile" });
  await assert.rejects(runBackup({ ...env }, retention.runtime, new Date("2026-03-01T02:03:04Z"), "abcdef123456"), /deletefile failed/);
  assert.ok(retention.calls.some(({ args }) => args[0] === "deletefile" && args.at(-1)?.includes("20260101T020304Z")));
  assert.equal(retention.calls.some(({ args }) => args[0] === "deletefile" && args.at(-1)?.includes("20260301T020304Z-abcdef123456")), false);
});

test("formats only a strict logical manifest basename for operator output", () => {
  assert.equal(formatManifestBasename({ manifest: "postgres-r2-20260301T020304Z-abcdef123456.manifest.json" }), "postgres-r2-20260301T020304Z-abcdef123456.manifest.json");
  assert.throws(() => formatManifestBasename({ manifest: "crypt:ofertasuper-r2/secret" }), /manifest name invalid/);
});

test("workflow remains manual-only, pins checkout, and documents failure semantics", () => {
  const script = read("scripts/postgres-backup-r2.mjs"), workflow = read(".github/workflows/database-backup.yml"), docs = read("docs/database-backup-recovery-runbook.md");
  assert.match(workflow, /actions\/checkout@11d5960a326750d5838078e36cf38b85af677262\s+# v4/); assert.match(workflow, /BACKUP_DATABASE_ROLE/); assert.match(workflow, /BACKUP_CRYPT_REMOTE:\s*\$\{\{ vars\.BACKUP_CRYPT_REMOTE \}\}/); assert.doesNotMatch(workflow, /^\s+RCLONE_CRYPT_REMOTE:/m); assert.match(workflow, /DATABASE_URL:\s*\$\{\{ secrets\.BACKUP_DATABASE_URL \}\}/); assert.doesNotMatch(workflow, /DATABASE_URL:\s*\$\{\{ secrets\.DATABASE_URL \}\}|schedule:|cron:/);
  assertRuntimeCryptPasswordDerivation(workflow);
  assertFixedR2NoCheckBucket(workflow);
  assert.doesNotMatch(workflow, /set -x/);
  const install = workflow.indexOf("Install pinned rclone"), derive = workflow.indexOf("Derive rclone crypt passwords"), backup = workflow.indexOf("npm run backup:postgres-r2"); assert.ok(install >= 0 && install < derive && derive < backup);
  assert.match(script, /createHash|--immutable|manifest\.uploading|BACKUP_DATABASE_ROLE/); assert.doesNotMatch(script, /--file=|writeFile|createWriteStream/);
  assert.match(docs, /BACKUP_CRYPT_REMOTE.*logical/i); assert.match(docs, /RCLONE_CRYPT_REMOTE.*reserved/i); assert.match(docs, /retention failure.*fails/i); assert.match(docs, /never writes a plaintext dump/i); assert.match(docs, /plaintext.*do not pre-obscure|do not pre-obscure.*plaintext/i);
});
