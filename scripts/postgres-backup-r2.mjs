import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { Transform } from "node:stream";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export const RCLONE_VERSION = "1.75.0";
export const PG_IMAGE = "postgres:17.6-bookworm@sha256:f3bd19c606e442c3d7bdfa8002e03fe260a1023351e0ea4598032022b68dd6e3";
const OWNED = /^postgres-r2-(\d{8}T\d{6}Z-[a-f0-9]{12})\.(dump|manifest\.json)$/;
const PG_NAMES = ["PGHOST", "PGPORT", "PGUSER", "PGPASSWORD", "PGDATABASE", "PGSSLMODE"];
const RCLONE_CONFIG_CLEANUP = ["RCLONE_CONFIG_R2_ACCESS_KEY_ID", "RCLONE_CONFIG_R2_SECRET_ACCESS_KEY", "RCLONE_CONFIG_CRYPT_PASSWORD", "RCLONE_CONFIG_CRYPT_PASSWORD2"];
const PROCESS_TIMEOUT = 10 * 60 * 1000;

function required(value, name) { if (!value) throw new Error(`${name} is required`); return value; }
function directDatabase(value, role) {
  let url; try { url = new URL(value); } catch { throw new Error("DATABASE_URL must be a direct PostgreSQL URL"); }
  if (!/^postgres(ql)?:$/.test(url.protocol) || !url.hostname || !url.username || !url.password || !url.pathname.slice(1)) throw new Error("DATABASE_URL must be a direct PostgreSQL URL");
  const user = decodeURIComponent(url.username);
  if (user !== required(role, "BACKUP_DATABASE_ROLE")) throw new Error("BACKUP_DATABASE_ROLE must exactly match DATABASE_URL username");
  return { PGHOST: url.hostname, PGPORT: url.port || "5432", PGUSER: user, PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: decodeURIComponent(url.pathname.slice(1)), PGSSLMODE: url.searchParams.get("sslmode") || "require" };
}
function backupNames(now, runId) {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const suffix = String(runId).match(/(?:\d{8}T\d{6}Z-)?([a-f0-9]{12})$/)?.[1];
  if (!suffix) throw new Error("backup run identifier must end in 12 lowercase hex characters");
  const archive = `postgres-r2-${stamp}-${suffix}.dump`;
  return { archive, manifest: `${archive.slice(0, -5)}.manifest.json` };
}
export function formatManifestBasename(plan) {
  const manifest = String(plan?.manifest || "");
  if (!OWNED.test(manifest) || !manifest.endsWith(".manifest.json")) throw new Error("backup manifest name invalid");
  return manifest;
}

export function redact(value, canaries = []) {
  let safe = String(value).replace(/postgres(?:ql)?:\/\/[^\s'"`]+/gi, "[REDACTED_DATABASE_URL]");
  for (const canary of canaries.filter((item) => typeof item === "string" && item.length > 3)) safe = safe.replaceAll(canary, "[REDACTED]");
  return safe;
}
export function createBackupPlan(environment, now = new Date(), runId = crypto.randomUUID().replaceAll("-", "").slice(0, 12)) {
  const remote = required(environment.RCLONE_CRYPT_REMOTE, "RCLONE_CRYPT_REMOTE");
  if (!/^crypt:[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(remote) || remote.includes("..")) throw new Error("RCLONE_CRYPT_REMOTE must name a crypt remote");
  const retention = Number(environment.BACKUP_RETENTION ?? 7);
  if (!Number.isInteger(retention) || retention < 2 || retention > 90) throw new Error("BACKUP_RETENTION must be an integer between 2 and 90");
  const names = backupNames(now, runId);
  return { pg: directDatabase(required(environment.DATABASE_URL, "DATABASE_URL"), environment.BACKUP_DATABASE_ROLE), remote, retention, image: environment.PG_IMAGE || PG_IMAGE, ...names, temporary: `${names.archive}.uploading`, manifestTemporary: `${names.manifest}.uploading` };
}
export function selectOwnedPairs(files, retention) {
  const pairs = new Map();
  for (const file of files) {
    const match = OWNED.exec(file.trim()); if (!match) continue;
    const pair = pairs.get(match[1]) || {}; pair[match[2]] = file.trim(); pairs.set(match[1], pair);
  }
  return [...pairs].filter(([, pair]) => pair.dump && pair["manifest.json"]).sort(([a], [b]) => b.localeCompare(a)).slice(retention).flatMap(([, pair]) => [pair.dump, pair["manifest.json"]]);
}
function metricStream() {
  const hash = createHash("sha256"); let bytes = 0;
  const tap = new Transform({ transform(chunk, _encoding, done) { bytes += chunk.length; hash.update(chunk); done(null, chunk); } });
  return { tap, result: () => ({ bytes, sha256: hash.digest("hex") }) };
}

export function createRuntime(spawnProcess = spawn, spawnSyncProcess = spawnSync) {
  const command = async (program, args, options = {}) => {
    const result = spawnSyncProcess(program, args, { encoding: "utf8", input: options.input, env: options.env, stdio: ["pipe", "pipe", "pipe"], timeout: PROCESS_TIMEOUT, killSignal: "SIGKILL" });
    if (result.error || !(options.acceptStatuses || [0]).includes(result.status)) throw new Error(`${program} command failed`);
    return /** @type {{ stdout: string, status?: number | null }} */ ({ stdout: result.stdout || "", status: result.status });
  };
  const pipeline = (source, destination, options = {}) => new Promise((resolvePipeline, rejectPipeline) => {
    const metric = metricStream(), children = []; let left, right, output = "", closed = 0, failed = false, failedSide = "", settled = false;
    const stop = (child) => { if (!child.killed) child.kill("SIGKILL"); };
    const fail = (side = "") => { if (!failed) { failed = true; failedSide = side; children.forEach(stop); } };
    const abort = () => fail();
    const done = () => {
      if (settled || closed !== children.length) return;
      settled = true; options.signal?.removeEventListener("abort", abort);
      if (failed) rejectPipeline(new Error(failedSide ? `backup ${failedSide} stream command failed` : "backup stream command failed"));
      else resolvePipeline({ stdout: output, ...metric.result() });
    };
    const attach = (child, side) => { children.push(child); if (failed) stop(child); child.on("error", () => fail(side)); child.stderr.on("data", () => {}); child.stderr.on("error", () => fail(side)); child.on("close", (code, signal) => { if (code || signal) fail(side); closed += 1; done(); }); };
    if (options.signal?.aborted) { abort(); done(); return; }
    options.signal?.addEventListener("abort", abort, { once: true });
    let spawning = "source";
    try { left = spawnProcess(source.program, source.args, { env: options.env, signal: options.signal, stdio: ["ignore", "pipe", "pipe"], timeout: PROCESS_TIMEOUT, killSignal: "SIGKILL" }); attach(left, spawning); spawning = "destination"; right = spawnProcess(destination.program, destination.args, { env: options.env, signal: options.signal, stdio: ["pipe", "pipe", "pipe"], timeout: PROCESS_TIMEOUT, killSignal: "SIGKILL" }); attach(right, spawning); } catch { fail(spawning); done(); return; }
    left.stdout.on("error", () => fail("source")); metric.tap.on("error", () => fail("source")); right.stdin.on("error", () => fail("destination")); right.stdout.on("error", () => fail("destination")); right.stdout.on("data", (chunk) => { output += chunk; });
    left.stdout.pipe(metric.tap).pipe(right.stdin);
  });
  return { command, pipeline };
}
function commands(plan) {
  const docker = (tool, args) => ({ program: "docker", args: ["run", "--rm", "-i", ...PG_NAMES.flatMap((name) => ["--env", name]), plan.image, tool, ...args] });
  return { docker, rclone: (args) => ({ program: "rclone", args }) };
}
function validated(dumped, restored) {
  if (!dumped.bytes || !restored.bytes || !restored.stdout.trim()) throw new Error("backup validation produced an empty archive or listing");
  if (dumped.bytes !== restored.bytes || dumped.sha256 !== restored.sha256) throw new Error("backup integrity validation failed");
}
function ciphertextKey(value) { return /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value) && !value.split("/").includes("..") ? value : ""; }
function oneOutput(value) { const lines = value.trim().split("\n"); if (lines.length !== 1) throw new Error("ciphertext verification failed"); return lines[0]; }
async function ciphertext(runtime, plan, environment) {
  const logical = `${plan.remote}/${plan.archive}`;
  const decoded = oneOutput((await runtime.command("rclone", ["cryptdecode", "--reverse", logical], { env: environment })).stdout).split("\t");
  const key = decoded.length === 2 && decoded[0] === logical && ciphertextKey(decoded[1]) ? decoded[1] : "";
  if (!key) throw new Error("ciphertext verification failed");
  const raw = `${required(environment.RCLONE_CONFIG_CRYPT_REMOTE, "RCLONE_CONFIG_CRYPT_REMOTE")}/${key}`;
  const hash = oneOutput((await runtime.command("rclone", ["hashsum", "SHA-256", raw, "--download"], { env: environment })).stdout).match(/^([a-f0-9]{64})\s+\*?(.+)$/);
  if (!key || !hash || hash[2] !== raw) throw new Error("ciphertext verification failed");
  return { key, sha256: hash[1] };
}
async function verifiedVersion(runtime, environment) {
  const version = await runtime.command("rclone", ["version"], { env: environment });
  if (!new RegExp(`rclone v${RCLONE_VERSION.replaceAll(".", "\\.")}\\b`).test(version.stdout)) throw new Error("rclone version pin check failed");
}
function cryptRemoteRoot(remote) { return remote.slice(0, remote.indexOf(":") + 1); }
export function cryptProbeEnvironment(environment, candidate) {
  return {
    PATH: required(environment.PATH, "PATH"),
    ...(environment.HOME === undefined ? {} : { HOME: environment.HOME }),
    RCLONE_CONFIG: "/dev/null",
    RCLONE_CONFIG_CRYPT_TYPE: "crypt",
    RCLONE_CONFIG_CRYPT_REMOTE: "cryptprobe:",
    RCLONE_CONFIG_CRYPTPROBE_TYPE: "local",
    RCLONE_CONFIG_CRYPT_PASSWORD: candidate,
  };
}
async function rawPreflight(runtime, environment) {
  try { await runtime.command("rclone", ["lsf", "--max-depth", "1", required(environment.RCLONE_CONFIG_CRYPT_REMOTE, "RCLONE_CONFIG_CRYPT_REMOTE")], { env: environment }); } catch { throw new Error("R2 credential preflight failed"); }
}
async function cryptPreflight(runtime, remote, environment) {
  const args = ["backend", "features", cryptRemoteRoot(remote)];
  try { await runtime.command("rclone", args, { env: cryptProbeEnvironment(environment, environment.RCLONE_CONFIG_CRYPT_PASSWORD) }); } catch { throw new Error("primary crypt secret preflight failed"); }
  try { await runtime.command("rclone", args, { env: cryptProbeEnvironment(environment, environment.RCLONE_CONFIG_CRYPT_PASSWORD2) }); } catch { throw new Error("secondary crypt secret preflight failed"); }
}
async function retain(runtime, plan, environment) {
  const files = (await runtime.command("rclone", ["lsf", "--files-only", plan.remote], { env: environment })).stdout.split("\n");
  for (const file of selectOwnedPairs(files, plan.retention)) await runtime.command("rclone", ["deletefile", `${plan.remote}/${file}`], { env: environment });
}
async function cleanup(runtime, plan, environment, paths) {
  const failures = [];
  for (const path of new Set(paths.filter(Boolean))) try { await runtime.command("rclone", ["deletefile", `${plan.remote}/${path}`], { env: environment }); } catch (error) { failures.push(error); }
  return failures;
}
function cleanupError(primary, failures) { return failures.length ? new AggregateError([primary, ...failures], primary.message) : primary; }

export async function runBackup(environment, runtime = createRuntime(), now = new Date(), runId) {
  let plan, childEnv, primary, promoted, published = false; const owned = [];
  try {
    plan = createBackupPlan(environment, now, runId); delete environment.DATABASE_URL; childEnv = { ...environment, ...plan.pg };
    const { docker, rclone } = commands(plan);
    await verifiedVersion(runtime, childEnv);
    await rawPreflight(runtime, childEnv);
    await cryptPreflight(runtime, plan.remote, childEnv);
    owned.push(plan.temporary);
    const dumped = await runtime.pipeline(docker("pg_dump", ["--format=custom", "--no-owner", "--no-acl", "--lock-wait-timeout=30s", "--schema=public"]), rclone(["rcat", `${plan.remote}/${plan.temporary}`]), { env: childEnv });
    const restored = await runtime.pipeline(rclone(["cat", `${plan.remote}/${plan.temporary}`]), docker("pg_restore", ["--list"]), { env: childEnv });
    validated(dumped, restored);
    owned.push(plan.archive);
    await runtime.command("rclone", ["moveto", "--immutable", `${plan.remote}/${plan.temporary}`, `${plan.remote}/${plan.archive}`], { env: childEnv }); owned.splice(owned.indexOf(plan.temporary), 1); promoted = plan.archive;
    const encrypted = await ciphertext(runtime, plan, childEnv);
    owned.push(plan.manifestTemporary);
    const manifest = JSON.stringify({ schemaVersion: 2, archive: plan.archive, timestamp: now.toISOString(), format: "custom", validation: "pg_restore --list", bytes: dumped.bytes, sha256: dumped.sha256, ciphertext: encrypted }) + "\n";
    await runtime.command("rclone", ["rcat", `${plan.remote}/${plan.manifestTemporary}`], { env: childEnv, input: manifest });
    owned.push(plan.manifest);
    await runtime.command("rclone", ["moveto", "--immutable", `${plan.remote}/${plan.manifestTemporary}`, `${plan.remote}/${plan.manifest}`], { env: childEnv }); owned.splice(owned.indexOf(plan.manifestTemporary), 1); published = true;
    await retain(runtime, plan, childEnv);
  } catch (error) { primary = error; }
  finally {
    if (plan && primary && !published) primary = cleanupError(primary, await cleanup(runtime, plan, childEnv || environment, [...owned, promoted]));
    delete environment.DATABASE_URL; for (const name of RCLONE_CONFIG_CLEANUP) delete environment[name];
  }
  if (primary) throw primary;
  return plan;
}

async function main() {
  const canaries = Object.entries(process.env).filter(([name, value]) => /PASSWORD|SECRET|ACCESS_KEY|DATABASE_URL/.test(name) && value).map(([, value]) => value);
  try { const plan = await runBackup(process.env); console.log(formatManifestBasename(plan)); } catch (error) { console.error(redact(error.stack || error.message, canaries)); process.exitCode = 1; }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) void main();
