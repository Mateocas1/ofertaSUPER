import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { PassThrough } from "node:stream";
import test from "node:test";
import { createBackupPlan, createRuntime, redact, runBackup, selectOwnedPairs } from "../scripts/postgres-backup-r2.mjs";

const root = new URL("../", import.meta.url), read = (path: string) => readFileSync(new URL(path, root), "utf8");
const env = { DATABASE_URL: "postgresql://backup_user:secret-password@db.example:6543/catalog?sslmode=require", RCLONE_CRYPT_REMOTE: "crypt:ofertasuper-r2", RCLONE_CONFIG_CRYPT_REMOTE: "r2:bucket", BACKUP_RETENTION: "2", BACKUP_DATABASE_ROLE: "backup_user", PG_IMAGE: "postgres:17.6-bookworm@sha256:f3bd19c606e442c3d7bdfa8002e03fe260a1023351e0ea4598032022b68dd6e3" };
type Call = { program: string; args: string[]; input?: string; env?: Record<string, string> };
type MockOptions = { results?: { stdout: string; bytes: number; sha256: string }[]; fail?: string | ((program: string, args: string[]) => boolean); files?: string[]; version?: string };
const settles = (promise: Promise<unknown>) => {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("child settlement timed out")), 100); })]).finally(() => clearTimeout(timer));
};

function mockRuntime(options: MockOptions = {}) {
  const calls: Call[] = [], results = options.results || [{ stdout: "", bytes: 3, sha256: "a".repeat(64) }, { stdout: "archive contents\n", bytes: 3, sha256: "a".repeat(64) }];
  const fails = (program: string, args: string[]) => typeof options.fail === "function" ? options.fail(program, args) : Boolean(options.fail && args.join(" ").includes(options.fail));
  return { calls, runtime: {
    command: async (program: string, args: string[], input: { input?: string; env?: Record<string, string> } = {}) => {
      calls.push({ program, args, ...input });
      if (args[0] === "version") return { stdout: options.version || "rclone v1.75.0\n" };
      if (args[0] === "lsf") return { stdout: (options.files || []).join("\n") };
      if (args[0] === "cryptdecode") return { stdout: `${args[2]}\tencrypted/archive\n` };
      if (args[0] === "hashsum") return { stdout: `${"b".repeat(64)}  ${args[2]}\n` };
      if (fails(program, args)) throw new Error(`${typeof options.fail === "string" ? options.fail : args[0]} failed`);
      return { stdout: "" };
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

test("streams, verifies bytes/hash/listing, then atomically publishes both halves", async () => {
  const { calls, runtime } = mockRuntime({ files: ["postgres-r2-20260101T020304Z-abcdef123456.dump", "postgres-r2-20260101T020304Z-abcdef123456.manifest.json"] });
  const mutable = { ...env, RCLONE_CONFIG_CRYPT_PASSWORD: "crypt-canary" };
  await runBackup(mutable, runtime, new Date("2026-03-01T02:03:04Z"), "abcdef123456");
  assert.equal(mutable.DATABASE_URL, undefined); assert.equal(mutable.RCLONE_CONFIG_CRYPT_PASSWORD, undefined);
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

test("cleans failed temporary and immutable promotions without deleting a final manifest", async () => {
  const temporary = mockRuntime({ fail: (_program, args) => args[0] === "rcat" && Boolean(args.at(-1)?.endsWith("manifest.json.uploading")) });
  await assert.rejects(runBackup({ ...env }, temporary.runtime), /rcat failed/);
  assert.ok(temporary.calls.some(({ args }) => args[0] === "deletefile" && args.at(-1)?.endsWith(".dump")));
  assert.ok(temporary.calls.some(({ args }) => args[0] === "deletefile" && args.at(-1)?.endsWith("manifest.json.uploading")));
  const archive = mockRuntime({ fail: (_program, args) => args[0] === "moveto" && Boolean(args.at(-1)?.endsWith(".dump")) });
  await assert.rejects(runBackup({ ...env }, archive.runtime), /moveto failed/);
  assert.ok(archive.calls.some(({ args }) => args[0] === "deletefile" && args.at(-1)?.endsWith(".dump.uploading")));
  const promotion = mockRuntime(), command = promotion.runtime.command;
  promotion.runtime.command = async (...input: Parameters<typeof command>) => {
    if (input[1][0] === "moveto" && input[1].at(-1)?.endsWith("manifest.json")) throw new Error("manifest promotion failed");
    return command(...input);
  };
  await assert.rejects(runBackup({ ...env }, promotion.runtime), /manifest promotion failed/);
  assert.ok(promotion.calls.some(({ args }) => args[0] === "deletefile" && args.at(-1)?.endsWith(".dump")));
  assert.equal(promotion.calls.some(({ args }) => args[0] === "deletefile" && args.at(-1)?.endsWith(".manifest.json")), false);
  const aggregate = mockRuntime({ fail: (_program, args) => args[0] === "deletefile" || args[0] === "rcat" && Boolean(args.at(-1)?.endsWith("manifest.json.uploading")) });
  await assert.rejects(runBackup({ ...env }, aggregate.runtime), (error: Error) => { assert.ok(error instanceof AggregateError); assert.match(error.message, /rcat failed/); return true; });
  assert.equal(aggregate.calls.filter(({ args }) => args[0] === "deletefile").length, 2);
});

test("pipeline consumes stderr and settles both children after destination failure", async () => {
  const child = () => Object.assign(new EventEmitter(), { stdout: new PassThrough(), stdin: new PassThrough(), stderr: new PassThrough(), killed: false, kill() { this.killed = true; } });
  const source = child(), destination = child(); let count = 0;
  const pending = createRuntime((() => count++ ? destination : source) as never).pipeline({ program: "source", args: [] }, { program: "destination", args: [] });
  destination.emit("close", 1); await new Promise((resolve) => setImmediate(resolve));
  assert.equal(source.killed, true); assert.ok(source.stderr.listenerCount("data") && destination.stderr.listenerCount("data"));
  source.emit("close", null, "SIGTERM"); await assert.rejects(settles(pending), /backup stream command failed/);
    const controller = new AbortController(), abortSource = child(), abortDestination = child(); let abortCount = 0;
    const aborted = createRuntime((() => abortCount++ ? abortDestination : abortSource) as never).pipeline({ program: "source", args: [] }, { program: "destination", args: [] }, { signal: controller.signal });
    controller.abort(); assert.equal(abortSource.killed, true); assert.equal(abortDestination.killed, true);
    abortSource.emit("close", null, "SIGTERM"); abortDestination.emit("close", null, "SIGTERM"); await assert.rejects(settles(aborted), /backup stream command failed/);
    const stranded = child(); let spawned = 0;
    const synchronousThrow = createRuntime((() => { if (!spawned++) return stranded; throw new Error("destination spawn failed"); }) as never).pipeline({ program: "source", args: [] }, { program: "destination", args: [] });
    let settled = false; void synchronousThrow.then(() => { settled = true; }, () => { settled = true; });
    const rejected = assert.rejects(settles(synchronousThrow), /backup stream command failed/);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(settled, false); assert.equal(stranded.killed, true); assert.ok(stranded.stderr.listenerCount("data"));
    stranded.emit("close", null, "SIGTERM"); await rejected;
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

test("workflow remains manual-only, pins checkout, and documents failure semantics", () => {
  const script = read("scripts/postgres-backup-r2.mjs"), workflow = read(".github/workflows/database-backup.yml"), docs = read("docs/database-backup-recovery-runbook.md");
  assert.match(workflow, /actions\/checkout@11d5960a326750d5838078e36cf38b85af677262\s+# v4/); assert.match(workflow, /BACKUP_DATABASE_ROLE/); assert.match(workflow, /DATABASE_URL:\s*\$\{\{ secrets\.BACKUP_DATABASE_URL \}\}/); assert.doesNotMatch(workflow, /DATABASE_URL:\s*\$\{\{ secrets\.DATABASE_URL \}\}|schedule:|cron:/);
  assert.match(script, /createHash|--immutable|manifest\.uploading|BACKUP_DATABASE_ROLE/); assert.doesNotMatch(script, /--file=|writeFile|createWriteStream/);
  assert.match(docs, /retention failure.*fails/i); assert.match(docs, /never writes a plaintext dump/i);
});
