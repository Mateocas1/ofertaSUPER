import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
	calculateDirectRefreshDiscoveryPrewriteFoundationEvidenceSha256,
	calculateDirectRefreshDiscoverySourceConfigSnapshotSha256,
	evaluateDirectRefreshDiscoveryPrewriteFoundation,
	parseDirectRefreshDiscoverySourceConfigSnapshotFiles,
	parseDirectRefreshDiscoveryPrewriteFoundationCliOptions,
	parseDirectRefreshDiscoveryPrewriteFoundationEvidenceJson,
} from "./pipeline/direct-refresh-discovery-prewrite-foundation";

async function writeJson(output: string, report: unknown) {
	await mkdir(dirname(output), { recursive: true });
	await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
	process.stdout.write(
		`Wrote direct-refresh discovery prewrite foundation audit to ${output}\n`,
	);
}

async function readSafeRollbackArtifact(path: string | undefined) {
	if (
		typeof path !== "string" ||
		!/^audit\/direct-refresh-discovery-rollback-verification\/[A-Za-z0-9._/-]+\.json$/.test(
			path,
		) ||
		path.includes("..")
	) {
		return undefined;
	}
	try {
		const content = await readFile(path, "utf8");
		return {
			sha256: `sha256:${createHash("sha256").update(content).digest("hex")}`,
			generatedAt: parseGeneratedAt(content),
		};
	} catch {
		return undefined;
	}
}

function parseGeneratedAt(content: string) {
	try {
		const parsed = JSON.parse(content.replace(/^\uFEFF/, "")) as unknown;
		if (!parsed || typeof parsed !== "object") return undefined;
		const generatedAt = (parsed as { generatedAt?: unknown }).generatedAt;
		return typeof generatedAt === "string" ? generatedAt : undefined;
	} catch {
		return undefined;
	}
}

async function main() {
	const options = parseDirectRefreshDiscoveryPrewriteFoundationCliOptions();
	const rawEvidence = await readFile(options.evidence, "utf8");
	const evidence = parseDirectRefreshDiscoveryPrewriteFoundationEvidenceJson(
		rawEvidence,
	);
	const sourceConfigFiles = await Promise.all(
		parseDirectRefreshDiscoverySourceConfigSnapshotFiles(
			evidence.artifactLineage?.sourceConfigSnapshot,
		).map(async (filePath) => ({
			path: filePath,
			content: await readFile(filePath, "utf8"),
		})),
	);
	const rollbackPreimageArtifact = await readSafeRollbackArtifact(
		evidence.rollbackDrill?.preimageArtifact,
	);
	const postRollbackVerificationArtifact = await readSafeRollbackArtifact(
		evidence.rollbackDrill?.postRollbackVerificationArtifact,
	);
	const report = evaluateDirectRefreshDiscoveryPrewriteFoundation({
		evidence,
		evidencePath: options.evidence,
		evidenceSha256:
			calculateDirectRefreshDiscoveryPrewriteFoundationEvidenceSha256(
				evidence,
			),
		sourceConfigSnapshotSha256:
			calculateDirectRefreshDiscoverySourceConfigSnapshotSha256(
				sourceConfigFiles,
			),
		rollbackPreimageSha256: rollbackPreimageArtifact?.sha256,
		rollbackPreimageGeneratedAt: rollbackPreimageArtifact?.generatedAt,
		postRollbackVerificationSha256: postRollbackVerificationArtifact?.sha256,
		postRollbackVerificationGeneratedAt:
			postRollbackVerificationArtifact?.generatedAt,
	});
	await writeJson(options.output, report);
	if (report.status === "FAIL") process.exitCode = 1;
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
	void main().catch((error) => {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	});
}
