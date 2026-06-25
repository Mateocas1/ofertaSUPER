import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
	EXPECTED_ISSUE_334_ARTIFACT_MANIFEST,
	TRIAGE_CLASSIFICATION_PRECEDENCE,
	assertCalibrationOnlyWording,
	assertReadOnlyTriageFlags,
	buildTriageOutputPath,
	resolveTriageClassification,
	selectDeterministicCategoryPathSample,
	validateApprovedTriageOutputIssue,
	validateTriageClassification,
	verifyIssue334ArtifactManifest,
} from "../scripts/pipeline/vea-likely-missing-triage";

describe("Vea likely-missing triage", () => {
	it("fails closed on missing or hash-mismatched issue #334 artifacts", () => {
		assert.deepEqual(
			EXPECTED_ISSUE_334_ARTIFACT_MANIFEST.map(({ role, path, sha256 }) => ({ role, path, sha256 })),
			[
				{ role: "candidateAudit", path: "audit/coverage/issue-334/vea/category-pagination/category-pagination-audit.json", sha256: "7dee0acb4c151715c566e7ebaa15e358b5258ec9395e22fff2cedabb0ca9d359" },
				{ role: "catalogSnapshot", path: "audit/catalog-snapshots/issue-334/vea/catalog-identities.json", sha256: "ed9c7bee429cfbd5946aace64b10bd43916c0b8d395528f10408eeb4df0ef358" },
				{ role: "comparisonReport", path: "audit/catalog-comparison/issue-334/vea/category-pagination/category-pagination-catalog-comparison.json", sha256: "57f504581b7326516b020c3301bde69732b53a31ae959a55051b5ec8524e0396" },
			],
		);
		const missing = verifyIssue334ArtifactManifest({});
		assert.equal(missing.status, "FAIL");
		assert.match(missing.failClosedReasons.join("\n"), /missing candidateAudit artifact/);
		const mismatched = verifyIssue334ArtifactManifest(Object.fromEntries(EXPECTED_ISSUE_334_ARTIFACT_MANIFEST.map((entry) => [entry.path, `wrong ${entry.role}`])));
		assert.equal(mismatched.status, "FAIL");
		assert.match(mismatched.failClosedReasons.join("\n"), /sha256 mismatch/);
	});

	it("passes artifact gate when every declared manifest hash matches", () => {
		const manifest = [{ role: "candidateAudit" as const, source: "vea" as const, issue: 334 as const, path: "audit/coverage/issue-334/vea/category-pagination/category-pagination-audit.json", sha256: "64b58fcd18e2e312a3d93d0c545ec988f7101639ff3041d4da16b9625d32954f", expected: "synthetic fixture" }];
		const gate = verifyIssue334ArtifactManifest({ [manifest[0].path]: "synthetic candidate audit" }, manifest);
		assert.equal(gate.status, "PASS");
		assert.deepEqual(gate.failClosedReasons, []);
		assert.equal(gate.inputs[0].actualSha256, manifest[0].sha256);
	});

	it("samples 50 candidates deterministically by categoryPath and reports constraints", () => {
		const candidates = [
			...Array.from({ length: 30 }, (_, i) => candidate(`a-${i}`, "almacen")),
			...Array.from({ length: 15 }, (_, i) => candidate(`b-${i}`, "bebidas")),
			...Array.from({ length: 10 }, (_, i) => candidate(`c-${i}`, "limpieza")),
			candidate("missing-category", ""),
		];
		const first = selectDeterministicCategoryPathSample(candidates, { seed: "issue-334-vea-triage-v1", requestedSize: 50 });
		const second = selectDeterministicCategoryPathSample(candidates, { seed: "issue-334-vea-triage-v1", requestedSize: 50 });
		assert.equal(first.selected.length, 50);
		assert.deepEqual(first.selected.map((entry) => entry.candidateIdentity), second.selected.map((entry) => entry.candidateIdentity));
		assert.deepEqual(first.strata.map((stratum) => [stratum.categoryPath, stratum.selectedCount]), [["almacen", 27], ["bebidas", 14], ["limpieza", 9]]);
		assert.match(first.constraints.join("\n"), /excluded 1 candidates without categoryPath/);
	});

	it("selects deterministic strata when categoryPath strata exceed requested size", () => {
		const candidates = Array.from({ length: 55 }, (_, i) => candidate(`sku-${i}`, `category-${String(i).padStart(2, "0")}`));
		const sample = selectDeterministicCategoryPathSample(candidates, { seed: "issue-334-vea-triage-v1", requestedSize: 50 });
		assert.equal(sample.selected.length, 50);
		assert.equal(sample.strata.filter((stratum) => stratum.selectedCount === 1).length, 50);
		assert.equal(sample.strata.filter((stratum) => stratum.selectedCount === 0).length, 5);
		assert.match(sample.constraints.join("\n"), /omitted 5 categoryPath strata/);
	});

	it("validates taxonomy precedence with separate followUpReason", () => {
		assert.deepEqual(TRIAGE_CLASSIFICATION_PRECEDENCE, ["source_or_candidate_artifact", "already_present_alternate_identity", "equivalent_variant_or_pack", "valid_investigation_candidate", "insufficient_evidence"]);
		assert.equal(resolveTriageClassification({ alreadyPresentAlternateIdentity: true, equivalentVariantOrPack: true }), "already_present_alternate_identity");
		assert.equal(resolveTriageClassification({ alreadyPresentAlternateIdentity: true, sourceOrCandidateArtifact: true }), "source_or_candidate_artifact");
		assert.deepEqual(validateTriageClassification({ classification: "valid_investigation_candidate", followUpReason: "Needs decision-grade review later" }), { classification: "valid_investigation_candidate", followUpReason: "Needs decision-grade review later" });
		assert.throws(() => validateTriageClassification({ classification: "needs_follow_up", followUpReason: "not a bucket" }), /taxonomy value/);
	});

	it("enforces Vea-only output path, read-only flags, and no-overclaiming wording", () => {
		assert.equal(validateApprovedTriageOutputIssue(335), 335);
		assert.throws(() => validateApprovedTriageOutputIssue(null), /approved output issue number/);
		assert.equal(buildTriageOutputPath({ issue: 335, fileName: "report.json" }), "audit/triage/issue-335/vea/category-pagination/report.json");
		assert.throws(() => buildTriageOutputPath({ issue: 335, fileName: "../report.json" }), /traversal|unsafe/);
		assert.throws(() => buildTriageOutputPath({ issue: 335, fileName: "report.txt" }), /JSON or Markdown/);
		assert.throws(() => assertReadOnlyTriageFlags(["node", "script", "--source=disco"]), /Vea-only/);
		assert.throws(() => assertReadOnlyTriageFlags(["node", "script", "--source=vea", "--write"]), /read-only triage rejects --write/);
		assert.doesNotThrow(() => assertCalibrationOnlyWording("Calibration-only Vea sample; investigation-only, no ingestion authorization."));
		assert.throws(() => assertCalibrationOnlyWording("This confirms 50 missing products with full catalog coverage."), /calibration-only|confirmed missing|full catalog coverage/);
	});

	it("rejects non-Vea split source argv while preserving Vea", () => {
		assert.throws(() => assertReadOnlyTriageFlags(["node", "script", "--source", "disco"]), /Vea-only/);
		assert.throws(() => assertReadOnlyTriageFlags(["node", "script", "--source=vea", "--source", "disco"]), /Vea-only/);
		assert.doesNotThrow(() => assertReadOnlyTriageFlags(["node", "script", "--source", "vea"]));
	});
});

function candidate(identity: string, categoryPath: string) {
	return { source: "vea", surface: "category-pagination", identityKind: "skuId", identity, categoryPath };
}
