import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { type AuditFinding, type DependencyPath, type PersistedLifecycleReceipt, validateProductionGraphEvidence } from "../src/lib/production-readiness/dependency-gate";
export const PRODUCTION_SECURITY_COMMANDS = [["npm", "ci", "--ignore-scripts", "--no-audit", "--no-fund"], ["npm", "ls", "--omit=dev", "--all", "--json", "--long"], ["npm", "audit", "--omit=dev", "--json", "--ignore-scripts"]] as const;
const CANDIDATE_FILES = ["package.json", "package-lock.json", "scripts/production-security-graph-evidence.ts", "src/lib/production-readiness/dependency-gate.ts"];
const lifecycleNames = ["preinstall", "install", "postinstall", "prepare"];
const digest = (value: string | Buffer) => `sha256:${createHash("sha256").update(value).digest("hex")}`; const canonical = (value: unknown): string => JSON.stringify(sort(value));
const sort = (value: unknown): unknown => Array.isArray(value) ? value.map(sort) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => [key, sort(nested)])) : value;
const hasExactKeys = (value: unknown, keys: readonly string[]) => Boolean(value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)));
export function createProductionGraphEvidence(input: { tree: DependencyPath[]; findings: AuditFinding[]; lifecycle: PersistedLifecycleReceipt[]; audit: { sha256: string; status: number }; candidate: Record<string, string> }) { const graph = validateProductionGraphEvidence(input);
	if (!graph.allowed || !isDigest(input.audit.sha256) || input.audit.status !== 0 || input.findings.length) throw new Error(`graph evidence rejected: ${[...graph.reasons, !isDigest(input.audit.sha256) ? "audit digest invalid" : "", input.audit.status !== 0 ? "audit command failed" : "", input.findings.length ? "audit findings present" : ""].filter(Boolean).join(", ")}`);
	const classifications = graph.classifications;
	const lifecycle = [...input.lifecycle].sort((a, b) => a.path.localeCompare(b.path));
	const records = [{ path: "audit.json", sha256: input.audit.sha256 }, { path: "classifications.json", sha256: digest(`${canonical(classifications)}\n`) }, { path: "lifecycle.json", sha256: digest(`${canonical(lifecycle)}\n`) }];
	const snapshotId = graphSnapshot({ candidate: input.candidate, audit: input.audit, classifications, lifecycle, records });
	return { snapshotId, classifications, lifecycle, manifest: { schema: "production-security-graph/v1", snapshotId, candidate: input.candidate, commands: PRODUCTION_SECURITY_COMMANDS, audit: input.audit, records } };
}
export function verifyRetainedProductionGraphEvidence(input: { directorySnapshotId: string; anchor: { snapshotId: string; candidate: Record<string, string> }; manifest: ReturnType<typeof createProductionGraphEvidence>["manifest"]; records: { audit: string; classifications: string; lifecycle: string }; candidate: Record<string, string> }) {
	try { const classifications = JSON.parse(input.records.classifications) as ReturnType<typeof validateProductionGraphEvidence>["classifications"], lifecycle = JSON.parse(input.records.lifecycle) as PersistedLifecycleReceipt[], audit = JSON.parse(input.records.audit) as { vulnerabilities?: Record<string, unknown> };
		if (!Array.isArray(classifications) || !Array.isArray(lifecycle) || !audit.vulnerabilities || Object.keys(audit.vulnerabilities).length || input.records.classifications !== `${canonical(classifications)}\n` || input.records.lifecycle !== `${canonical(lifecycle)}\n`) throw new Error();
		const graph = validateProductionGraphEvidence({ tree: classifications.map(({ package: name, version, path }) => ({ package: name, version, path })), findings: [], lifecycle }), records = [{ path: "audit.json", sha256: digest(input.records.audit) }, { path: "classifications.json", sha256: digest(input.records.classifications) }, { path: "lifecycle.json", sha256: digest(input.records.lifecycle) }], snapshotId = graphSnapshot({ candidate: input.candidate, audit: input.manifest.audit, classifications: graph.classifications, lifecycle, records });
		if (!hasExactKeys(input.records, ["audit", "classifications", "lifecycle"]) || !hasExactKeys(input.anchor, ["snapshotId", "candidate"]) || !hasExactKeys(input.manifest, ["schema", "snapshotId", "candidate", "commands", "audit", "records"]) || input.manifest.schema !== "production-security-graph/v1" || !hasExactKeys(input.manifest.candidate, CANDIDATE_FILES) || !hasExactKeys(input.candidate, CANDIDATE_FILES) || !hasExactKeys(input.anchor.candidate, CANDIDATE_FILES) || !hasExactKeys(input.manifest.audit, ["sha256", "status"]) || !input.manifest.records.every((record) => hasExactKeys(record, ["path", "sha256"])) || !classifications.every((record) => hasExactKeys(record, ["advisories", "package", "path", "remediation", "version"])) || !lifecycle.every((record) => hasExactKeys(record, ["hasInstallScript", "markerExecuted", "package", "path", "status", "version"])) || !graph.allowed || !Object.values(input.candidate).every(isDigest) || canonical(classifications) !== canonical(graph.classifications) || !isDigest(input.manifest.audit.sha256) || input.manifest.audit.sha256 !== records[0].sha256 || input.manifest.audit.status !== 0 || canonical(input.manifest.commands) !== canonical(PRODUCTION_SECURITY_COMMANDS) || canonical(input.manifest.records) !== canonical(records) || canonical(input.manifest.candidate) !== canonical(input.candidate) || canonical(input.anchor.candidate) !== canonical(input.candidate) || ![input.directorySnapshotId, input.anchor.snapshotId, input.manifest.snapshotId].every((value) => value === snapshotId)) throw new Error();
		return true;
	} catch {
		throw new Error("retained graph evidence rejected");
	}
}
function graphSnapshot(input: { candidate: Record<string, string>; audit: { sha256: string; status: number }; classifications: unknown; lifecycle: unknown; records: unknown }) {
	return digest(canonical({ candidate: input.candidate, commands: PRODUCTION_SECURITY_COMMANDS, audit: input.audit, classifications: input.classifications, lifecycle: input.lifecycle, records: input.records }));
}
const isDigest = (value: string) => /^sha256:[a-f0-9]{64}$/.test(value); function run(root: string, args: readonly string[]) {
	const result = spawnSync(args[0], args.slice(1), { cwd: root, encoding: "utf8", shell: false, env: protectedEnvironment() as NodeJS.ProcessEnv });
	if (result.error) throw new Error(`command failed: ${args[0]}`);
	return { status: result.status ?? 1, stdout: result.stdout ?? "" };
}
function protectedEnvironment() {
	return Object.fromEntries(["HOME", "PATH", "SystemRoot", "ComSpec", "TEMP", "TMP"].flatMap((name) => process.env[name] === undefined ? [] : [[name, process.env[name] as string]]));
}
export function extractProductionTree(raw: string, root: string) {
	const paths = new Map<string, DependencyPath>();
	const visit = (dependencies: Record<string, unknown>) => Object.entries(dependencies).forEach(([name, value]) => {
		const entry = value as { path?: string; version?: string; dependencies?: Record<string, unknown> };
		if (!entry.path && !entry.version) {
			if (entry.dependencies) visit(entry.dependencies);
			return;
		}
		if (!entry.path || !entry.version) throw new Error(`installed dependency incomplete: ${name}`);
		const path = relative(root, entry.path).replaceAll("\\", "/");
		const previous = paths.get(path);
		if (previous && (previous.package !== name || previous.version !== entry.version)) throw new Error(`installed dependency identity mismatch: ${path}`);
		paths.set(path, { package: name, version: entry.version, path });
		if (entry.dependencies) visit(entry.dependencies);
	});
	visit((JSON.parse(raw) as { dependencies?: Record<string, unknown> }).dependencies ?? {});
	return [...paths.values()].sort((a, b) => a.path.localeCompare(b.path));
}

function lifecycleFor(tree: DependencyPath[], root: string): PersistedLifecycleReceipt[] {
	return tree.map((entry) => {
		const pkg = JSON.parse(readFileSync(join(root, entry.path, "package.json"), "utf8")) as { scripts?: Record<string, string> };
		return { ...entry, hasInstallScript: lifecycleNames.some((name) => Boolean(pkg.scripts?.[name])), markerExecuted: false, status: "skipped" };
	});
}

function writeImmutable(path: string, source: string) {
	const descriptor = openSync(path, "wx", 0o600);
	writeFileSync(descriptor, `${source}\n`);
	return digest(`${source}\n`);
}

function capture(root: string) {
	const lockBefore = digest(readFileSync(join(root, "package-lock.json")));
	if (run(root, PRODUCTION_SECURITY_COMMANDS[0]).status !== 0) throw new Error("canonical clean installation failed");
	if (lockBefore !== digest(readFileSync(join(root, "package-lock.json")))) throw new Error("lockfile changed during clean installation");
	const installed = run(root, PRODUCTION_SECURITY_COMMANDS[1]);
	if (installed.status !== 0) throw new Error("production dependency tree failed");
	const audit = run(root, PRODUCTION_SECURITY_COMMANDS[2]);
	const auditJson = JSON.parse(audit.stdout) as { vulnerabilities?: Record<string, unknown> };
	const findings = Object.keys(auditJson.vulnerabilities ?? {}).map((advisory) => ({ advisory }));
	const tree = extractProductionTree(installed.stdout, root);
	const candidate = Object.fromEntries(CANDIDATE_FILES.map((file) => [file, digest(readFileSync(join(root, file)))]));
	const auditRecord = `${audit.stdout.trim()}\n`;
	const evidence = createProductionGraphEvidence({ tree, findings, lifecycle: lifecycleFor(tree, root), audit: { sha256: digest(auditRecord), status: audit.status }, candidate });
	const directory = join(root, "audit", "production-security-graph", evidence.snapshotId, randomUUID());
	mkdirSync(directory, { recursive: true });
	writeImmutable(join(directory, "audit.json"), audit.stdout.trim());
	writeImmutable(join(directory, "classifications.json"), canonical(evidence.classifications));
	writeImmutable(join(directory, "lifecycle.json"), canonical(evidence.lifecycle));
	writeImmutable(join(directory, "manifest.json"), canonical(evidence.manifest));
	verifyRetainedProductionGraphEvidence({ directorySnapshotId: evidence.snapshotId, anchor: { snapshotId: evidence.snapshotId, candidate }, manifest: JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8")), records: Object.fromEntries(["audit", "classifications", "lifecycle"].map((name) => [name, readFileSync(join(directory, `${name}.json`), "utf8")])) as { audit: string; classifications: string; lifecycle: string }, candidate: Object.fromEntries(CANDIDATE_FILES.map((file) => [file, digest(readFileSync(join(root, file)))])) });
	console.log(`Production graph evidence passed and was written to ignored local evidence requiring independent verification: ${directory}`);
}

if (process.argv[1]?.endsWith("production-security-graph-evidence.ts")) capture(process.cwd());
