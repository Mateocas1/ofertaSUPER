import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { assertReadOnlyTriageFlags, buildTriageOutputPath } from "./pipeline/vea-likely-missing-triage";

export type VeaTriageCliHandoff = { approvedOutputIssue: number; reportPath: string; summaryPath: string };

export function parseVeaTriageCliArgs(argv: string[]): VeaTriageCliHandoff {
	assertReadOnlyTriageFlags(argv);
	const approvedOutputIssue = readOutputIssue(argv);
	return {
		approvedOutputIssue,
		reportPath: buildTriageOutputPath({ issue: approvedOutputIssue, fileName: "report.json" }),
		summaryPath: buildTriageOutputPath({ issue: approvedOutputIssue, fileName: "summary.md" }),
	};
}

function readOutputIssue(argv: string[]) {
	for (let index = 0; index < argv.length; index += 1) {
		const entry = argv[index];
		if (entry.startsWith("--output-issue=")) return parseIssueNumber(entry.slice("--output-issue=".length));
		if (entry === "--output-issue") return parseIssueNumber(argv[index + 1]);
	}
	throw new Error("Vea triage CLI requires an approved issue-number handoff via --output-issue");
}

function parseIssueNumber(value: unknown) {
	const issue = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : NaN;
	if (!Number.isInteger(issue) || issue <= 0) throw new Error("Vea triage CLI requires a valid approved issue-number handoff");
	return issue;
}

export function isVeaTriageCliEntrypoint(metaUrl: string, argvEntry: string | undefined) {
	return argvEntry ? fileURLToPath(metaUrl) === resolve(argvEntry) : false;
}

if (isVeaTriageCliEntrypoint(import.meta.url, process.argv[1])) {
	console.log(JSON.stringify(parseVeaTriageCliArgs(process.argv.slice(2)), null, 2));
}
