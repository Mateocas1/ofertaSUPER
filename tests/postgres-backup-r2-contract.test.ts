import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { PassThrough } from "node:stream";
import test from "node:test";
import { createBackupPlan, createRuntime, formatManifestBasename, redact, runBackup, selectOwnedPairs } from "../scripts/postgres-backup-r2.mjs";

const root = new URL("../", import.meta.url), read = (path: string) => readFileSync(new URL(path, root), "utf8");
const env = { DATABASE_URL: "postgresql://backup_user:secret-password@db.example:6543/catalog?sslmode=require", RCLONE_CRYPT_REMOTE: "crypt:ofertasuper-r2", RCLONE_CONFIG_CRYPT_REMOTE: "r2:bucket", BACKUP_RETENTION: "2", BACKUP_DATABASE_ROLE: "backup_user", PG_IMAGE: "postgres:17.6-bookworm@sha256:f3bd19c606e442c3d7bdfa8002e03fe260a1023351e0ea4598032022b68dd6e3" };
type Call = { program: string; args: string[]; input?: string; env?: Record<string, string> };
type MockOptions = { results?: { stdout: string; bytes: number; sha256: string }[]; fail?: string | ((program: string, args: string[]) => boolean); error?: string; files?: string[]; version?: string };
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
  const fails = (program: string, args: string[]) => typeof options.fail === "function" ? options.fail(program, args) : Boolean(options.fail && args.join(" ").includes(options.fail));
  return { calls, runtime: {
    command: async (program: string, args: string[], input: { input?: string; env?: Record<string, string> } = {}) => {
      calls.push({ program, args, ...input });
      if (fails(program, args)) throw new Error(options.error || `${typeof options.fail === "string" ? options.fail : args[0]} failed`);
      return { stdout: mockOutput(args, options) };
    },
    pipeline: async (source: Call, destination: Call) => {
      calls.push(source, destination);
      if (options.fail === "stream") throw new Error("stream failed");
      return results.shift()!;
    },
  }};
}

test("plans only a direct role and redacts the URL", () => {
  const plan = createBackupPlan(env, new Date("2026-03-01T02:03:04Z"), "abcdef123456");
  assert.equal(plan.pg.PGUSER, "backup_user");
  assert.throws(() => createBackupPlan({ ...env, BACKUP_DATABASE_ROLE: "other" }), /BACKUP_DATABASE_ROLE/);
  assert.throws(() => createBackupPlan({ ...env, RCLONE_CRYPT_REMOTE: "r2:plain" }), /crypt/);
  assert.doesNotMatch(redact(env.DATABASE_URL), /secret-password|db\.example/);
});

test("retention ignores incomplete newer objects and deletes only old complete pairs", () => {
  const complete = (stamp: string, id: string) => [`postgres-r2-${stamp}-${id}.dump`, `postgres-r2-${stamp}-${id}.manifest.json`];
  const files = ["postgres-r2-20260401T020304Z-abcdef123456.dump", ...complete("20260301T020304Z", "bbcdef123456"), ...complete("20260201T020304Z", "cbcdef123456"), ...complete("20260101T020304Z", "dbcdef123456"), "foreign.txt"];
  assert.deepEqual(selectOwnedPairs(files, 2), complete("20260101T020304Z", "dbcdef123456"));
});

test("preflights raw R2 then crypt backend features without listing a crypt path", async () => {
  const raw = mockRuntime({ fail: (_program, args) => args[0] === "lsf" && args.at(-1) === env.RCLONE_CONFIG_CRYPT_REMOTE, error: "raw-r2-secret r2:bucket" });
  await assert.rejects(runBackup({ ...env }, raw.runtime), (error: Error) => { assert.match(error.message, /^R2 credential preflight failed$/); assert.doesNotMatch(error.message, /raw-r2-secret|r2:bucket/); return true; });
  assert.deepEqual(raw.calls.map(({ program, args }) => [program, args]), [["rclone", ["version"]], ["rclone", ["lsf", "--max-depth", "1", "r2:bucket"]]]);

  const crypt = mockRuntime({ fail: (_program, args) => args[0] === "backend" && args[1] === "features", error: "crypt-password crypt:" });
  await assert.rejects(runBackup({ ...env }, crypt.runtime), (error: Error) => { assert.match(error.message, /^crypt remote preflight failed$/); assert.doesNotMatch(error.message, /crypt-password|crypt:/); return true; });
  assert.deepEqual(crypt.calls.map(({ program, args }) => [program, args]), [["rclone", ["version"]], ["rclone", ["lsf", "--max-depth", "1", "r2:bucket"]], ["rclone", ["backend", "features", "crypt:"]]]);
});

test("streams, verifies bytes/hash/listing, then atomically publishes both halves", async () => {
  const { calls, runtime } = mockRuntime({ files: ["postgres-r2-20260101T020304Z-abcdef123456.dump", "postgres-r2-20260101T020304Z-abcdef123456.manifest.json"] });
  const mutable = { ...env, RCLONE_CONFIG_CRYPT_PASSWORD: "crypt-canary" };
  await runBackup(mutable, runtime, new Date("2026-03-01T02:03:04Z"), "abcdef123456");
  assert.equal(mutable.DATABASE_URL, undefined); assert.equal(mutable.RCLONE_CONFIG_CRYPT_PASSWORD, undefined);
  const firstUpload = calls.findIndex(({ args }) => args[0] === "rcat" && args.at(-1)?.endsWith(".dump.uploading"));
  const rcloneCalls = calls.filter(({ program }) => program === "rclone");
  assert.deepEqual(rcloneCalls.slice(0, 3).map(({ program, args }) => [program, args]), [["rclone", ["version"]], ["rclone", ["lsf", "--max-depth", "1", "r2:bucket"]], ["rclone", ["backend", "features", "crypt:"]]]);
  assert.equal(rcloneCalls[3].args[0], "rcat");
  assert.equal(calls.some(({ args }) => args[0] === "lsf" && args.includes("--max-depth") && args.at(-1) === "crypt:"), false);
  const remotePaths = calls.filter(({ args }) => ["rcat", "cat", "moveto", "deletefile"].includes(args[0]) || args[0] === "lsf" && args.includes("--files-only")).flatMap(({ args }) => args.filter((arg) => arg.startsWith("crypt:")));
  assert.ok(remotePaths.length > 0 && remotePaths.every((path) => path === env.RCLONE_CRYPT_REMOTE || path.startsWith(`${env.RCLONE_CRYPT_REMOTE}/`)));
  const retentionList = calls.findIndex(({ args }) => args[0] === "lsf" && args.includes("--files-only") && args.at(-1) === env.RCLONE_CRYPT_REMOTE);
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
    assert.deepEqual(calls.filter(({ program }) => program === "docker").map(({ args }) => args), [
      ["run", "--rm", "-i", "--env", "PGHOST", "--env", "PGPORT", "--env", "PGUSER", "--env", "PGPASSWORD", "--env", "PGDATABASE", "--env", "PGSSLMODE", env.PG_IMAGE, "pg_dump", "--format=custom", "--no-owner", "--no-acl", "--serializable-deferrable"],
      ["run", "--rm", "-i", "--env", "PGHOST", "--env", "PGPORT", "--env", "PGUSER", "--env", "PGPASSWORD", "--env", "PGDATABASE", "--env", "PGSSLMODE", env.PG_IMAGE, "pg_restore", "--list"],
    ]);
    assert.ok(calls.every(({ args }) => !args.some((arg) => [env.DATABASE_URL, "backup_user", "secret-password", "db.example", "6543", "catalog"].includes(arg))));
});

test("rejects bad, empty, or mismatched restored archives before publication", async () => {
  for (const restored of [{ stdout: "", bytes: 3, sha256: "a".repeat(64) }, { stdout: "list", bytes: 0, sha256: "a".repeat(64) }, { stdout: "list", bytes: 4, sha256: "b".repeat(64) }]) {
    const { calls, runtime } = mockRuntime({ results: [{ stdout: "", bytes: 3, sha256: "a".repeat(64) }, restored] });
    await assert.rejects(runBackup({ ...env }, runtime), /validation|integrity/);
    assert.equal(calls.some(({ args }) => args[0] === "moveto"), false);
    assert.ok(calls.some(({ args }) => args[0] === "deletefile" && args.at(-1)?.endsWith(".dump.uploading")));
  }
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
  assert.match(workflow, /actions\/checkout@11d5960a326750d5838078e36cf38b85af677262\s+# v4/); assert.match(workflow, /BACKUP_DATABASE_ROLE/); assert.match(workflow, /DATABASE_URL:\s*\$\{\{ secrets\.BACKUP_DATABASE_URL \}\}/); assert.doesNotMatch(workflow, /DATABASE_URL:\s*\$\{\{ secrets\.DATABASE_URL \}\}|schedule:|cron:/);
  assert.match(script, /createHash|--immutable|manifest\.uploading|BACKUP_DATABASE_ROLE/); assert.doesNotMatch(script, /--file=|writeFile|createWriteStream/);
  assert.match(docs, /retention failure.*fails/i); assert.match(docs, /never writes a plaintext dump/i);
});
