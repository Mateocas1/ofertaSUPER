import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sha256 } from "../../src/lib/production-readiness/canonical";

import {
	createAuthorityCandidate,
	verifyAuthorityCandidate,
} from "../../src/lib/production-readiness/candidate";

const candidateInput = {
	release: {
		releaseId: "release-2026-08-25",
		deploymentId: "deployment-42",
		fullSha: "e4d26186dd0f977da70996038d8d4fefb4087eb2",
		domain: "catalog.example.test",
		target: "production",
		scope: "catalog:ar",
		validFrom: "2026-08-25T00:00:00.000Z",
		expiresAt: "2026-08-26T00:00:00.000Z",
	},
	policy: {
		version: "refresh-policy/v1",
		bytes: { permittedClasses: ["offer-update"], source: "vea" },
	},
	baseline: {
		kind: "real-baseline/v1",
		snapshotDigest: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
		dataDigest: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
		evidence: {
			kind: "independent-baseline-evidence/v1",
			artifactDigest: "sha256:3333333333333333333333333333333333333333333333333333333333333333",
			provenance: "postgres-repeatable-read",
		},
		coverage: { unit: "source-ean", expectedUniverse: "unknown", observedCount: "2" },
		watermarks: { observedAt: "2026-08-25T00:00:00.000Z" },
		provenance: { verifier: "independent-reader", generator: "baseline-builder/v1" },
		canonicalizationVersion: "os03-c14n/v1",
	},
	generatorVersion: "authority-candidate-generator/v1",
	canonicalizationVersion: "os03-c14n/v1",
} as const;

describe("authority-candidate/v1", () => {
	it("binds exact release, policy, and real baseline evidence into reproducible bytes", () => {
		const candidate = createAuthorityCandidate(candidateInput);
		const repeated = createAuthorityCandidate({
			canonicalizationVersion: "os03-c14n/v1",
			generatorVersion: "authority-candidate-generator/v1",
			baseline: { ...candidateInput.baseline, provenance: { generator: "baseline-builder/v1", verifier: "independent-reader" } },
			policy: { bytes: { source: "vea", permittedClasses: ["offer-update"] }, version: "refresh-policy/v1" },
			release: { ...candidateInput.release },
		});

		assert.equal(candidate.version, "authority-candidate/v1");
		assert.equal(candidate.candidateDigest, repeated.candidateDigest);
		assert.match(candidate.manifestBytes, /"fullSha":"e4d26186/);
		assert.equal(verifyAuthorityCandidate(candidate), true);
		for (const [path, value] of [["release.fullSha", "a".repeat(39)], ["baseline.evidence.provenance", ""], ["baseline.coverage.unit", ""], ["baseline.watermarks.observedAt", ""], ["baseline.provenance.verifier", ""], ["policy.bytes", "{}"]] as const) {
			const manifest = JSON.parse(candidate.manifestBytes);
			if (path.startsWith("baseline.evidence")) manifest.baseline.evidence.provenance = value;
			else if (path.startsWith("baseline.coverage")) manifest.baseline.coverage.unit = value;
			else if (path.startsWith("baseline.watermarks")) manifest.baseline.watermarks.observedAt = value;
			else if (path.startsWith("baseline.provenance")) manifest.baseline.provenance.verifier = value;
			else if (path.startsWith("release")) manifest.release.fullSha = value;
			else manifest.policy.bytes = value;
			const manifestBytes = JSON.stringify(manifest);
			assert.equal(verifyAuthorityCandidate({ ...candidate, manifestBytes, candidateDigest: sha256(manifestBytes) }), false, path);
		}
	});

	it("rejects bare/fixture evidence, identity conflation, and unsupported versions", () => {
		assert.throws(() => createAuthorityCandidate({ candidateDigest: "sha256:deadbeef" } as never));
		assert.throws(() => createAuthorityCandidate({ ...candidateInput, baseline: { ...candidateInput.baseline, kind: "fixture" } } as never));
		assert.throws(() => createAuthorityCandidate({ ...candidateInput, release: { ...candidateInput.release, releaseId: candidateInput.baseline.dataDigest } }));
		assert.throws(() => createAuthorityCandidate({ ...candidateInput, policy: { ...candidateInput.policy, version: "refresh-policy/v2" } } as never));
	});

	it("changes on contract changes but never includes a conforming future delta", () => {
		const original = createAuthorityCandidate(candidateInput);
		const changed = createAuthorityCandidate({ ...candidateInput, release: { ...candidateInput.release, scope: "catalog:uy" } });
		const rebuilt = createAuthorityCandidate({ ...candidateInput, futureDelta: { evidenceDigest: "sha256:4444444444444444444444444444444444444444444444444444444444444444" } } as never);

		assert.notEqual(changed.candidateDigest, original.candidateDigest);
		assert.notEqual(createAuthorityCandidate({ ...candidateInput, release: { ...candidateInput.release, fullSha: "a4d26186dd0f977da70996038d8d4fefb4087eb2" } }).candidateDigest, original.candidateDigest);
		assert.notEqual(createAuthorityCandidate({ ...candidateInput, release: { ...candidateInput.release, expiresAt: "2026-08-27T00:00:00.000Z" } }).candidateDigest, original.candidateDigest);
		assert.notEqual(createAuthorityCandidate({ ...candidateInput, policy: { ...candidateInput.policy, bytes: { permittedClasses: ["offer-update", "history-append"], source: "vea" } } }).candidateDigest, original.candidateDigest);
		assert.equal(rebuilt.candidateDigest, original.candidateDigest);
	});
});
