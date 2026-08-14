export type DependencyPath = { package: string; version: string; path: string };
export type AuditFinding = { path?: string; advisory?: string };
export type LifecycleReceipt = { path: string; hasInstallScript?: boolean; markerExecuted?: boolean };

export const FOUNDATION_PATHS = [
	"scripts/production-security-evidence.ts",
	"src/lib/production-readiness/dependency-gate.ts",
	"tests/production-dependency-gate.test.ts",
] as const;

type Verdict = { allowed: boolean; reasons: string[] };

export function assertJsonAuditInput({ path, raw }: { path: string; raw: string }) {
	if (!isRepositoryJsonPath(path)) throw new Error("repository-relative JSON audit file required");
	const value: unknown = JSON.parse(raw);
	if (!value || Array.isArray(value) || typeof value !== "object") throw new Error("JSON audit object required");
	return value as Record<string, unknown>;
}

export function validatePairedPackages(packages: Record<string, string>): Verdict {
	const versions = [packages.next, packages["@next/env"], packages["eslint-config-next"]];
	if (versions.some((version) => !version?.trim())) return { allowed: false, reasons: ["paired package version missing"] };
	return new Set(versions).size === 1 ? { allowed: true, reasons: [] } : { allowed: false, reasons: ["paired package versions differ"] };
}

export function classifyProductionAudit({ tree, findings }: { tree: DependencyPath[]; findings: AuditFinding[] }) {
	const reasons: string[] = [];
	if (!tree.length) reasons.push("supplied tree missing");
	const sortedTree = [...tree].sort((left, right) => left.path.localeCompare(right.path));
	const paths = new Set<string>();
	for (const entry of sortedTree) {
		if (!entry.package || !entry.version || !entry.path) reasons.push("supplied tree path incomplete");
		if (paths.has(entry.path)) reasons.push(`duplicate supplied tree path: ${entry.path}`);
		paths.add(entry.path);
	}
	const advisories = new Map<string, string[]>();
	for (const finding of findings) {
		if (!finding.path) {
			reasons.push("audit finding path missing");
			continue;
		}
		if (!paths.has(finding.path)) {
			reasons.push(`unclassified audit finding: ${finding.path}`);
			continue;
		}
		if (!finding.advisory) {
			reasons.push(`audit finding advisory missing: ${finding.path}`);
			continue;
		}
		const found = advisories.get(finding.path) ?? [];
		found.push(finding.advisory);
		advisories.set(finding.path, found);
	}
	const classifications = sortedTree.map((entry) => {
		const found = [...(advisories.get(entry.path) ?? [])].sort();
		if (found.length) reasons.push(...found.map((advisory) => `residual finding: ${entry.path}#${advisory}`));
		return { ...entry, advisories: found, remediation: found.length ? "residual" : "clear" };
	});
	return { allowed: reasons.length === 0, reasons: [...new Set(reasons)].sort(), classifications };
}

export function evaluateGraphAuthority({ tree, findings, lifecycle }: { tree: DependencyPath[]; findings: AuditFinding[]; lifecycle: LifecycleReceipt[] }) {
	const audit = classifyProductionAudit({ tree, findings });
	const reasons = [...audit.reasons];
	const markers = new Map<string, LifecycleReceipt>();
	for (const receipt of lifecycle) {
		if (markers.has(receipt.path)) reasons.push(`duplicate lifecycle receipt: ${receipt.path}`);
		markers.set(receipt.path, receipt);
	}
	for (const entry of tree) {
		const receipt = markers.get(entry.path);
		if (!receipt) {
			reasons.push(`lifecycle receipt missing: ${entry.path}`);
			continue;
		}
		if (typeof receipt.hasInstallScript !== "boolean" || typeof receipt.markerExecuted !== "boolean") reasons.push(`lifecycle marker unknown: ${entry.path}`);
		else if (receipt.markerExecuted) reasons.push(`lifecycle marker executed: ${entry.path}`);
	}
	for (const path of markers.keys()) if (!tree.some((entry) => entry.path === path)) reasons.push(`unclassified lifecycle receipt: ${path}`);
	return { allowed: reasons.length === 0, reasons: [...new Set(reasons)].sort(), classifications: audit.classifications };
}

export function validateFoundationInventory(input: { root: string; expectedRoot: string; base: string; expectedBase: string; staged: string[]; paths: readonly string[] }): Verdict {
	const reasons: string[] = [];
	if (input.root !== input.expectedRoot) reasons.push("repository root mismatch");
	if (input.base !== input.expectedBase) reasons.push("base mismatch");
	if (input.staged.length) reasons.push("staged paths present");
	if (!input.paths.length) reasons.push("foundation inventory empty");
	if (!samePaths(input.paths, FOUNDATION_PATHS)) reasons.push("foundation inventory mismatch");
	return { allowed: reasons.length === 0, reasons };
}

function isRepositoryJsonPath(path: string) {
	return Boolean(path) && !path.includes("\0") && !path.includes("\\") && !path.startsWith("/") && !/^[A-Za-z]:/.test(path) && path.toLowerCase().endsWith(".json") && path.split("/").every((segment) => segment && segment !== "." && segment !== "..");
}

function samePaths(actual: readonly string[], expected: readonly string[]) {
	if (actual.length !== expected.length) return false;
	const expectedPaths = [...expected].sort();
	return [...actual].sort().every((path, index) => path === expectedPaths[index]);
}
