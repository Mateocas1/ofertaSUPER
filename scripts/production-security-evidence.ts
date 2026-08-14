import { spawnSync } from "node:child_process";

import { assertJsonAuditInput } from "../src/lib/production-readiness/dependency-gate";

export const NPM_AUDIT_ARGS = ["audit", "--omit=dev", "--json", "--ignore-scripts"];

type Environment = Record<string, string | undefined>;
type RunOptions = { shell: false; env: Record<string, string> };
export type BaselineRunner = (command: string, args: string[], options: RunOptions) => { status: number | null; stdout: string; error?: Error };

const ENVIRONMENT_ALLOWLIST = ["HOME", "PATH", "SystemRoot", "ComSpec", "TEMP", "TMP"];

export function captureBaselineEvidence({ environment = process.env, runner = runNpmAudit }: { environment?: Environment; runner?: BaselineRunner }) {
	const env = protectedEnvironment(environment);
	const result = runner("npm", NPM_AUDIT_ARGS, { shell: false, env });
	if (result.error) throw new Error("npm audit execution failed");
	const audit = assertJsonAuditInput({ path: "evidence/production-audit.json", raw: result.stdout });
	return JSON.stringify(canonicalize({ audit, command: ["npm", ...NPM_AUDIT_ARGS], environment: Object.keys(env).sort(), status: result.status ?? 1 }), null, 2);
}

function protectedEnvironment(environment: Environment) {
	return Object.fromEntries(ENVIRONMENT_ALLOWLIST.flatMap((name) => environment[name] === undefined ? [] : [[name, environment[name] as string]]));
}

function canonicalize(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonicalize);
	if (!value || typeof value !== "object") return value;
	return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, nested]) => [key, canonicalize(nested)]));
}

function runNpmAudit(command: string, args: string[], options: RunOptions) {
	const result = spawnSync(command, args, { ...options, encoding: "utf8" });
	return { status: result.status, stdout: result.stdout ?? "", error: result.error };
}

if (process.argv[1]?.endsWith("production-security-evidence.ts")) {
	if (process.argv.length !== 3 || process.argv[2] !== "--baseline") throw new Error("only --baseline is supported");
	process.stdout.write(`${captureBaselineEvidence({})}\n`);
}
