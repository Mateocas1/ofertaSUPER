import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import test from "node:test";
import { createRecoveryPlan, runRecovery } from "../scripts/postgres-recovery-r2.mjs";

const root = new URL("../", import.meta.url), read = (path: string) => readFileSync(new URL(path, root), "utf8");
const env = { RECOVERY_MANIFEST_KEY: "postgres-r2-20260301T020304Z-abcdef123456.manifest.json", BACKUP_CRYPT_REMOTE: "crypt:backups", RCLONE_CONFIG_CRYPT_REMOTE: "r2:bucket", RCLONE_CONFIG_CRYPT_PASSWORD: "canary", RCLONE_CONFIG_CRYPT_PASSWORD2: "canary2" };
const manifest = { schemaVersion: 2, archive: "postgres-r2-20260301T020304Z-abcdef123456.dump", timestamp: "2026-03-01T02:03:04.000Z", format: "custom", validation: "pg_restore --list", bytes: 3, sha256: "a".repeat(64), ciphertext: { key: "enc/archive", sha256: "d7439bee24773bcbfa2d0a97947ee36227b10d1022b1a55847e928965bb6bfde" } };
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



test("unsafe manifest input makes zero rclone or Docker calls", async () => {
  for (const key of ["../x", "dir/x", "x\\y", "x\u0000y"]) {
    const calls: string[] = [], runtime = { command: async (program: string) => { calls.push(program); return { stdout: "" }; }, pipeline: async () => ({}) };
    await assert.rejects(runRecovery({ ...env, RECOVERY_MANIFEST_KEY: key }, runtime as never), /manifest key/);
    assert.deepEqual(calls, []);
  }
  assert.throws(() => createRecoveryPlan({ ...env, RECOVERY_MANIFEST_KEY: "../x" }), /manifest key/);
});

test("RED: recovery rejects every non-owned manifest basename before runtime", () => {
  for (const key of ["x.manifest.json", "postgres-r2-20260301T020304Z-abcdef123456.dump", "postgres-r2-20260301T020304Z-abcdef123456.manifest.json/", "postgres-r2-20260301T020304Z-ABCDEF123456.manifest.json"]) assert.throws(() => createRecoveryPlan({ ...env, RECOVERY_MANIFEST_KEY: key }), /manifest key/);
});

test("recovery verifies one downloaded ciphertext before creating a unique disposable target", async () => {
  const calls: string[][] = [], childEnvs: Record<string, string>[] = [];
  const psql = (sql: string) => [[sql.includes("UNION"), "products|1\nsupermarkets|1\nsupermarket_products|1\nprice_history|1\n"], [sql.includes("server_version"), "17.6\n"], [sql.includes("migration_name"), "20260320_init\n20260322_ingestion_sprint1\n20260322_price_history_avg_idx\n20260322_staging_unlogged\n20260605_direct_refresh_run_ledger\n20260606_discovery_prewrite_foundation\n20260823_production_readiness_state\n20260824_catalog_publication_verification\n"], [sql.includes("information_schema"), "price_history\nproducts\nsupermarket_products\nsupermarkets\n"], [sql.includes("pg_indexes"), "price_history_supermarket_product_id_scraped_at_idx\nproducts_category_idx\nsupermarket_products_product_ean_supermarket_id_key\nsupermarkets_slug_key\n"]].find(([match]) => match)?.[1] || "0\n";
  const runtime = { command: async (program: string, args: string[], options: { env?: Record<string, string> } = {}) => {
    calls.push([program, ...args]); if (options.env) childEnvs.push({ ...options.env });
    if (args[0] === "version") return { stdout: "rclone v1.75.0\n" };
    if (args[0] === "cat" && args[1].startsWith("crypt:")) return { stdout: JSON.stringify(manifest) };
    if (args[0] === "cryptdecode") return { stdout: "crypt:backups/postgres-r2-20260301T020304Z-abcdef123456.dump\tenc/archive\n" };
    if (args[0] === "copyto") { writeFileSync(args.at(-1)!, "raw"); return { stdout: "" }; }
    return { stdout: args.includes("psql") ? psql(args.at(-1) || "") : "" };
  }, pipeline: async (source: { args: string[] }, destination: { args: string[] }) => { calls.push(["pipe", ...source.args, "=>", ...destination.args]); return {}; } };
  const receipt = await runRecovery({ ...env, RCLONE_CRYPT_REMOTE: "crypt:reserved-collision" }, runtime as never, () => "a".repeat(32));
  assert.deepEqual(receipt!.counts, { products: 1, supermarkets: 1, supermarket_products: 1, price_history: 1 }); assert.equal(receipt!.migrations, 8);
  assert.equal(calls.filter((call) => call[1] === "copyto").length, 1);
  const pipe = calls.find((call) => call[0] === "pipe")!;
  assert.ok(pipe.includes("recovery:backups/postgres-r2-20260301T020304Z-abcdef123456.dump"));
  assert.ok(pipe.includes("--exit-on-error")); assert.ok(pipe.includes("pg_restore"));
  const copy = calls.find((call) => call[1] === "copyto")!, local = childEnvs.find((item) => item.RCLONE_CONFIG_RECOVERYLOCAL_TYPE === "local")!;
  assert.equal(copy.at(-1), `${local.RCLONE_CONFIG_RECOVERY_REMOTE.slice("recoverylocal:".length)}/enc/archive`); assert.ok(childEnvs.every((item) => item.RCLONE_CRYPT_REMOTE === undefined));
  assert.ok(calls.some((call) => call.includes("network") && call.includes("create")));
  assert.ok(calls.some((call) => call.includes("volume") && call.includes("create")));
});

test("mismatch creates neither Docker target nor restore, and contracts keep secrets out of receipts", async () => {
  const calls: string[] = [], runtime = { command: async (program: string, args: string[]) => {
    calls.push(program);
    if (args[0] === "version") return { stdout: "rclone v1.75.0\n" };
    if (args[0] === "cat") return { stdout: JSON.stringify(manifest) };
    if (args[0] === "cryptdecode") return { stdout: "crypt:backups/postgres-r2-20260301T020304Z-abcdef123456.dump\tenc/archive\n" };
    if (args[0] === "copyto") { writeFileSync(args.at(-1)!, "wrong"); return { stdout: "" }; }
    return { stdout: "" };
  }, pipeline: async () => ({}) };
  await assert.rejects(runRecovery({ ...env }, runtime as never), /ciphertext/);
  assert.equal(calls.includes("docker"), false);
  const script = read("scripts/postgres-recovery-r2.mjs"), workflow = read(".github/workflows/database-recovery.yml"), docs = read("docs/database-backup-recovery-runbook.md");
  assert.match(script, /createHash\("sha256"\)|sha256/); assert.match(script, /_prisma_migrations|pg_indexes|products|supermarkets|supermarket_products|price_history|ofertasuper_app/);
  assert.match(script, /\["network", "rm"\]|\["volume", "rm"\]|rm\(state\.workspace/); assert.match(script, /AggregateError|SIGINT|SIGTERM/);
  assert.match(workflow, /workflow_dispatch:[\s\S]*manifest_key:[\s\S]*required: true/); assert.equal((workflow.match(/^      manifest_key:/gm) || []).length, 1); assert.doesNotMatch(workflow, /schedule:|cron:/);
  assert.match(workflow, /actions\/checkout@11d5960a326750d5838078e36cf38b85af677262/); assert.match(workflow, /aa2804e08f48250e71009c727124b6341cd0288465804a9a09d14663cabafbaa/);
  assert.match(docs, /single.*download|no-Production authority|logical manifest/i);
});

function runtimeFor(option: Record<string, unknown> = {}) {
  const calls: { program: string; args: string[]; options?: { input?: string; signal?: AbortSignal } }[] = [], migrations = "20260320_init\n20260322_ingestion_sprint1\n20260322_price_history_avg_idx\n20260322_staging_unlogged\n20260605_direct_refresh_run_ledger\n20260606_discovery_prewrite_foundation\n20260823_production_readiness_state\n20260824_catalog_publication_verification\n";
  const command = async (program: string, args: string[], options: { input?: string; signal?: AbortSignal } = {}) => { calls.push({ program, args, options }); const sql = options.input || args.at(-1) || "";
    if (args[0] === "version") return { stdout: "rclone v1.75.0\n" }; if (args[0] === "cat" && args[1].startsWith("crypt:")) return { stdout: JSON.stringify(manifest) }; if (args[0] === "cryptdecode") return { stdout: "crypt:backups/postgres-r2-20260301T020304Z-abcdef123456.dump\tenc/archive\n" }; if (args[0] === "copyto") { writeFileSync(args.at(-1)!, "raw"); return { stdout: "" }; }
    if (args.includes("inspect")) return { stdout: "", status: option.collision ? 0 : 1 }; if (args.includes("pg_isready")) return { stdout: "", status: option.ready ? 1 : 0 }; if (option.grant && options.input?.includes("CREATE ROLE")) throw new Error("grant failed"); if (sql.includes("server_version")) return { stdout: "17.6\n" }; if (sql.includes("migration_name")) return { stdout: String(option.migrations ?? migrations) }; if (sql.includes("finished_at IS NULL")) return { stdout: `${option.unfinished || 0}\n` }; if (sql.includes("information_schema")) return { stdout: "price_history\nproducts\nsupermarket_products\nsupermarkets\n" }; if (sql.includes("pg_indexes")) return { stdout: String(option.indexes ?? "price_history_supermarket_product_id_scraped_at_idx\nproducts_category_idx\nsupermarket_products_product_ean_supermarket_id_key\nsupermarkets_slug_key\n") }; if (sql.includes("UNION")) return { stdout: String(option.counts ?? "products|1\nsupermarkets|1\nsupermarket_products|1\nprice_history|1\n") }; if (option.app && options.input?.includes("SET ROLE")) throw new Error("app read failed"); return { stdout: "" };
  };
  return { calls, runtime: { command, pipeline: async (_left: unknown, _right: unknown, options: { signal?: AbortSignal }) => { if (option.abort) (options.signal as AbortSignal).dispatchEvent(new Event("abort")); if (option.archive) throw new Error("archive failed"); return {}; } } };
}

test("verification failures and partial resources clean all owned targets", async () => {
  for (const [option, error] of [[{ migrations: "" }, /migration/], [{ unfinished: 1 }, /migration/], [{ indexes: "products_category_idx\n" }, /schema/], [{ counts: "products|0\nsupermarkets|1\nsupermarket_products|1\nprice_history|1\n" }, /count/], [{ app: true }, /app read/], [{ archive: true }, /archive/], [{ grant: true }, /grant/]] as const) {
    const { calls, runtime } = runtimeFor(option); await assert.rejects(runRecovery({ ...env }, runtime as never, () => "b".repeat(32)), error); assert.equal(calls.filter(({ args }) => args[0] === "rm" || args.slice(0, 2).join(" ") === "network rm" || args.slice(0, 2).join(" ") === "volume rm").length, 3);
  }
});

test("primary and cleanup failures are retained together", async () => {
  const aggregate = runtimeFor({ archive: true }), command = aggregate.runtime.command; aggregate.runtime.command = async (...input: Parameters<typeof command>) => { if (input[1][0] === "rm") throw new Error("cleanup failed"); return command(...input); };
  await assert.rejects(runRecovery({ ...env }, aggregate.runtime as never, () => "f".repeat(32)), (error: Error) => { assert.ok(error instanceof AggregateError); assert.match(error.message, /archive/); return true; });
});

test("collision never claims existing state and readiness is bounded", async () => {
  const collision = runtimeFor({ collision: true }); await assert.rejects(runRecovery({ ...env }, collision.runtime as never, () => "c".repeat(32)), /collision/); assert.equal(collision.calls.some(({ args }) => args.includes("create")), false);
  const slow = runtimeFor({ ready: true }); await assert.rejects(runRecovery({ ...env }, slow.runtime as never, () => "d".repeat(32), { attempts: 2, pause: async () => {} }), /readiness/); assert.equal(slow.calls.filter(({ args }) => args.includes("pg_isready")).length, 2);
});

test("abort reaches the restore pipeline, stops following phases, and redacts argv", async () => {
  const controller = new AbortController(), aborted = runtimeFor({ archive: true }); aborted.runtime.pipeline = async (_left: unknown, _right: unknown, options: { signal?: AbortSignal }) => { assert.equal(options.signal, controller.signal); controller.abort(); throw new Error("cancelled"); };
  await assert.rejects(runRecovery({ ...env }, aborted.runtime as never, () => "e".repeat(32), { signal: controller.signal }), /cancelled|recovery cancelled/); assert.equal(aborted.calls.some(({ options }) => options?.input?.includes("CREATE ROLE")), false); assert.ok(aborted.calls.every(({ args }) => !args.join(" ").includes("canary") && !args.join(" ").includes("PGPASSWORD=")));
});

test("workflow derives plaintext crypt secrets only at runtime", () => {
  const workflow = read(".github/workflows/database-recovery.yml"), docs = read("docs/database-backup-recovery-runbook.md");
  assertRuntimeCryptPasswordDerivation(workflow);
  assertFixedR2NoCheckBucket(workflow);
  assert.doesNotMatch(workflow, /set -x/);
  const install = workflow.indexOf("Install pinned rclone"), derive = workflow.indexOf("Derive rclone crypt passwords"), recovery = workflow.indexOf("npm run recovery:postgres-r2"); assert.ok(install >= 0 && install < derive && derive < recovery);
  assert.match(workflow, /BACKUP_CRYPT_REMOTE:\s*\$\{\{ vars\.BACKUP_CRYPT_REMOTE \}\}/); assert.doesNotMatch(workflow, /^\s+RCLONE_CRYPT_REMOTE:/m); assert.match(docs, /rotate both together/i); assert.match(docs, /ephemeral.*masked|masked.*ephemeral/i);
});
