import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createRuntime, PG_IMAGE, RCLONE_VERSION, redact } from "./postgres-backup-r2.mjs";

const ARCHIVE = /^postgres-r2-\d{8}T\d{6}Z-[a-f0-9]{12}\.dump$/, MANIFEST = /^postgres-r2-\d{8}T\d{6}Z-[a-f0-9]{12}\.manifest\.json$/, LIMIT = 1024 * 1024;
const TABLES = ["products", "supermarkets", "supermarket_products", "price_history"], INDEXES = ["supermarkets_slug_key", "products_category_idx", "supermarket_products_product_ean_supermarket_id_key", "price_history_supermarket_product_id_scraped_at_idx"];
const OWNER = "ofertasuper_owner", APP = "ofertasuper_app", DATABASE = "ofertasuper";
const fail = (message) => { throw new Error(message); };
const secret = (env) => Object.keys(env).filter((key) => key === "DATABASE_URL" || key.startsWith("RCLONE_CONFIG_") || key === "POSTGRES_PASSWORD").forEach((key) => delete env[key]);
const safeKey = (value) => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value) && !value.split("/").includes("..");
const object = (value) => value && typeof value === "object" ? value : {};
const same = (actual, expected) => actual.length === expected.length && actual.every((value, index) => value === expected[index]);
const check = (signal) => { if (signal?.aborted) fail("recovery cancelled"); };
const phase = async (signal, work) => { check(signal); const result = await work(); check(signal); return result; };

export function createRecoveryPlan(environment) {
  const manifest = environment.RECOVERY_MANIFEST_KEY, remote = environment.BACKUP_CRYPT_REMOTE;
  if (!MANIFEST.test(manifest || "")) fail("manifest key is invalid");
  if (typeof remote !== "string" || !/^crypt:[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(remote) || remote.includes("..")) fail("recovery remote is invalid");
  if (!environment.RCLONE_CONFIG_CRYPT_REMOTE) fail("recovery storage is invalid");
  return { manifest, remote, image: environment.PG_IMAGE || PG_IMAGE };
}
function parsed(text) { try { return JSON.parse(text); } catch { fail("manifest is invalid"); } }
function manifestFor(text, plan) {
  const data = object(parsed(text)), encrypted = object(data.ciphertext), linked = typeof data.archive === "string" && `${data.archive.slice(0, -5)}.manifest.json` === plan.manifest;
  if (![data.schemaVersion === 2, ARCHIVE.test(data.archive), linked, Number.isSafeInteger(data.bytes) && data.bytes > 0, /^[a-f0-9]{64}$/.test(data.sha256), safeKey(encrypted.key), /^[a-f0-9]{64}$/.test(encrypted.sha256)].every(Boolean)) fail("manifest is invalid");
  return data;
}
async function hash(path) { return await new Promise((done, reject) => { const value = createHash("sha256"), source = createReadStream(path); source.on("data", (chunk) => value.update(chunk)).on("error", reject).on("end", () => done(value.digest("hex"))); }); }
async function migrations() {
  const root = new URL("../prisma/migrations/", import.meta.url), entries = await readdir(root, { withFileTypes: true });
  return (await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => { await readFile(new URL(`${entry.name}/migration.sql`, root), "utf8"); return entry.name; }))).sort();
}
const docker = (runtime, env, args, options = {}) => runtime.command("docker", args, { env, ...options });
const psql = (runtime, env, container, sql, input) => docker(runtime, env, ["exec", "-i", container, "psql", "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-U", OWNER, "-d", DATABASE, ...(input ? ["-f", "-"] : ["-c", sql])], input ? { input: sql } : {}).then((result) => result.stdout.trim());
async function download(runtime, env, plan, manifest, workspace, signal) {
  const logical = `${plan.remote.slice(plan.remote.indexOf(":") + 1)}/${manifest.archive}`, lines = (await phase(signal, () => runtime.command("rclone", ["cryptdecode", "--reverse", "crypt:", logical], { env }))).stdout.trim().split("\n"), fields = lines.length === 1 ? lines[0].split("\t") : [];
  const [decodedLogical, key] = fields.length === 2 ? fields.map((field) => field.trim()) : [];
  if (decodedLogical !== logical || !safeKey(key) || key !== manifest.ciphertext.key) fail("ciphertext verification failed");
  const path = join(workspace, key); await mkdir(dirname(path), { recursive: true });
  await phase(signal, () => runtime.command("rclone", ["copyto", `${env.RCLONE_CONFIG_CRYPT_REMOTE}/${key}`, path], { env }));
  if (await hash(path) !== manifest.ciphertext.sha256) fail("ciphertext verification failed");
  return { logical, path };
}
async function ready(runtime, env, container, signal, options) {
  const attempts = options.attempts ?? 30, pause = options.pause ?? (() => new Promise((done) => setTimeout(done, 1000)));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const result = await phase(signal, () => docker(runtime, env, ["exec", container, "pg_isready", "-U", OWNER, "-d", DATABASE], { acceptStatuses: [0, 1, 2] }));
    if (result.status === 0) return;
    if (attempt + 1 < attempts) await phase(signal, pause);
  }
  fail("PostgreSQL readiness timed out");
}
async function targets(runtime, env, state, names, signal) {
  for (const [kind, name] of Object.entries(names)) if ((await phase(signal, () => docker(runtime, env, [kind, "inspect", name], { acceptStatuses: [0, 1] }))).status === 0) fail("recovery resource collision");
  state.network = names.network; await phase(signal, () => docker(runtime, env, ["network", "create", names.network]));
  state.volume = names.volume; await phase(signal, () => docker(runtime, env, ["volume", "create", names.volume]));
  state.container = names.container; await phase(signal, () => docker(runtime, env, ["run", "-d", "--name", names.container, "--network", names.network, "--env", "POSTGRES_USER", "--env", "POSTGRES_PASSWORD", "--env", "POSTGRES_DB", "-v", `${names.volume}:/var/lib/postgresql/data`, state.image]));
}
async function verify(runtime, env, container, signal) {
  if (!/^17\./.test(await phase(signal, () => psql(runtime, env, container, "SHOW server_version")))) fail("PostgreSQL version verification failed");
  const expected = await migrations(), names = (await phase(signal, () => psql(runtime, env, container, "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name"))).split("\n").filter(Boolean);
  if (Number(await phase(signal, () => psql(runtime, env, container, "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL"))) || !same(names, expected)) fail("migration verification failed");
  const tables = (await phase(signal, () => psql(runtime, env, container, `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN (${TABLES.map((name) => `'${name}'`).join(",")}) ORDER BY table_name`))).split("\n").filter(Boolean).sort();
  const indexes = (await phase(signal, () => psql(runtime, env, container, `SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname IN (${INDEXES.map((name) => `'${name}'`).join(",")}) ORDER BY indexname`))).split("\n").filter(Boolean).sort();
  if (!same(tables, [...TABLES].sort()) || !same(indexes, [...INDEXES].sort())) fail("schema verification failed");
  const rows = (await phase(signal, () => psql(runtime, env, container, `SELECT 'products',count(*) FROM products UNION ALL SELECT 'supermarkets',count(*) FROM supermarkets UNION ALL SELECT 'supermarket_products',count(*) FROM supermarket_products UNION ALL SELECT 'price_history',count(*) FROM price_history`))).split("\n").map((row) => row.split("|"));
  const counts = Object.fromEntries(rows.map(([name, count]) => [name, Number(count)]));
  if (rows.length !== TABLES.length || !same(Object.keys(counts).sort(), [...TABLES].sort()) || Object.values(counts).some((count) => !Number.isSafeInteger(count) || count < 1)) fail("catalog count verification failed");
  await phase(signal, () => psql(runtime, env, container, "SET ROLE ofertasuper_app; SELECT 1 FROM products LIMIT 1", true));
  return { counts, migrations: expected.length };
}
async function cleanup(runtime, envs, state) {
  const failures = [];
  for (const args of [["rm", "-f", state.container], ["network", "rm", state.network], ["volume", "rm", state.volume]].filter((args) => args.at(-1))) try { await docker(runtime, envs[1] || envs[0], args); } catch (error) { failures.push(error); }
  try { await rm(state.workspace, { recursive: true, force: true }); } catch (error) { failures.push(error); }
  envs.forEach(secret); return failures;
}
function finish(receipt, primary, failures) {
  if (primary) throw failures.length ? new AggregateError([primary, ...failures], primary.message) : primary;
  if (failures.length) throw new AggregateError(failures, "recovery cleanup failed");
  return receipt;
}
export async function runRecovery(environment, runtime = createRuntime(), id = () => randomUUID().replaceAll("-", ""), options = {}) {
  const state = { workspace: join(tmpdir(), `postgres-r2-recovery-${randomUUID()}`) }; let primary, receipt, child;
  try {
    const plan = createRecoveryPlan(environment), token = id(); if (!/^[a-f0-9]{32}$/.test(token)) fail("recovery identifier is invalid");
    const names = { container: `recovery-container-${token}`, network: `recovery-network-${token}`, volume: `recovery-volume-${token}` }; child = { ...environment, RCLONE_CONFIG: "/dev/null", POSTGRES_USER: OWNER, POSTGRES_DB: DATABASE, POSTGRES_PASSWORD: `recovery-${token}` }; delete child.RCLONE_CRYPT_REMOTE; state.image = plan.image;
    await phase(options.signal, () => runtime.command("rclone", ["version"], { env: child }).then((result) => /^rclone v1\.75\.0\b/.test(result.stdout) ? result : fail("rclone version pin check failed")));
    const text = (await phase(options.signal, () => runtime.command("rclone", ["cat", `${plan.remote}/${plan.manifest}`], { env: child, maxBuffer: LIMIT }))).stdout; if (Buffer.byteLength(text) > LIMIT) fail("manifest is invalid");
    const raw = await download(runtime, child, plan, manifestFor(text, plan), state.workspace, options.signal);
    Object.assign(child, { RCLONE_CONFIG_RECOVERYLOCAL_TYPE: "local", RCLONE_CONFIG_RECOVERY_TYPE: "crypt", RCLONE_CONFIG_RECOVERY_REMOTE: `recoverylocal:${state.workspace}`, RCLONE_CONFIG_RECOVERY_PASSWORD: child.RCLONE_CONFIG_CRYPT_PASSWORD, RCLONE_CONFIG_RECOVERY_PASSWORD2: child.RCLONE_CONFIG_CRYPT_PASSWORD2 });
    await targets(runtime, child, state, names, options.signal); await ready(runtime, child, state.container, options.signal, options);
    await phase(options.signal, () => runtime.pipeline({ program: "rclone", args: ["cat", `recovery:${raw.logical}`] }, { program: "docker", args: ["exec", "-i", state.container, "pg_restore", "--exit-on-error", "--no-owner", "--no-acl", "-U", OWNER, "-d", DATABASE] }, { env: child, signal: options.signal }));
    await phase(options.signal, () => psql(runtime, child, state.container, `CREATE ROLE ${APP} LOGIN`, true));
    const grants = await readFile(new URL("../docker/compose/app-grants.sql", import.meta.url), "utf8"); await phase(options.signal, () => psql(runtime, child, state.container, grants, true));
    const verified = await verify(runtime, child, state.container, options.signal); receipt = { rclone: RCLONE_VERSION, postgres: 17, restored: true, appRead: true, counts: verified.counts, migrations: verified.migrations, manifest_key: plan.manifest };
  } catch (error) { primary = error; }
  const failures = await cleanup(runtime, [environment, child].filter(Boolean), state);
  return finish(receipt, primary, failures);
}
async function main() {
  const controller = new AbortController(), canaries = Object.entries(process.env).filter(([key, value]) => /PASSWORD|SECRET|ACCESS/.test(key) && value).map(([, value]) => value);
  for (const name of ["SIGINT", "SIGTERM"]) process.once(name, () => controller.abort());
  try { console.log(JSON.stringify(await runRecovery(process.env, createRuntime(), undefined, { signal: controller.signal }))); } catch (error) { console.error(redact(error.stack || error.message, canaries)); process.exitCode = controller.signal.aborted ? 130 : 1; }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) void main();
