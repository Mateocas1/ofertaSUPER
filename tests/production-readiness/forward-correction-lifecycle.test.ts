import assert from "node:assert/strict";
import test from "node:test";

import { canonicalize, sha256, sha256Canonical } from "@/lib/production-readiness/canonical";
import { createForwardCorrectionRepository } from "@/lib/production-readiness/repository";
import { createPromotionReadyEnvelope, prepareForwardCorrection, verifyGovernedDelta } from "@/lib/production-readiness/verification";

const key = canonicalize({ ean: "12345678" });
const digest = (letter: string) => `sha256:${letter.repeat(64)}`;
const freeze = <T>(value: T): T => { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
type Candidate = { operationKey: string; current: { entity: "product"; key: string; facts: Record<string, unknown> }[]; items: { entity: "product"; key: string; before: Record<string, unknown>; after: Record<string, unknown> }[] };
function freshCorrection() {
  const original = freeze({ source: "vea", items: [{ entity: "product", key, before: { ean: "12345678", name: "before", brand: "old" }, after: { ean: "12345678", name: "bad", brand: "old" } }] });
  const current = { source: "vea", items: [{ entity: "product" as const, key, facts: { ean: "12345678", name: "bad", brand: "unrelated" } }] };
  return prepareForwardCorrection({ original, current, intent: { type: "governed-forward-correction/v1", source: "vea", entity: "product", key, fields: ["name"] }, verify: (candidate: Candidate) => {
    const policy = { version: "refresh-policy/v1" as const, source: "vea" as const, fields: { product: ["ean", "name", "brand"], offer: [], history: [] }, mutations: ["update"] as ("update")[], maximumSourceAgeMs: 60_000 };
    const capture = { operationKey: candidate.operationKey, source: "vea", observedAt: "2026-06-01T00:01:00.000Z", items: candidate.items };
    const binding = { candidateDigest: digest("a"), incarnation: "00000000-0000-4000-8000-000000000001", policyDigest: sha256Canonical(policy), buildDigest: digest("b"), healthVersion: "0", predecessorGeneration: "2", predecessorLineage: digest("c") };
    return verifyGovernedDelta({ verifier: { credential: "verifier/read-only", snapshot: "committed:correction", resultDigest: digest("d") }, policy, capture, binding: { ...binding, deltaDigest: sha256Canonical(capture) }, current: { binding, items: candidate.current }, actual: candidate.items.map((item: { entity: string; key: string; after: Record<string, unknown> }) => ({ entity: item.entity, key: item.key, facts: item.after })), evidence: { bytes: "fresh", sha256: sha256("fresh") }, verifiedAt: "2026-06-01T00:01:30.000Z" });
  } });
}

test("a fresh U14a envelope is immutably linked before the existing guarded promotion", async () => {
  const verified = freshCorrection(); const envelope = createPromotionReadyEnvelope(verified); const calls: string[] = [];
  const repository = createForwardCorrectionRepository({ execute: async (query, values) => {
    calls.push(query); if (query.includes("link_forward_correction")) return { rows: [{ result: { state: "LINKED" } }] };
    assert.deepEqual(values, [JSON.stringify({ key: "correction", manifestId: "00000000-0000-4000-8000-000000000012", expectedGeneration: "2", expectedHealthVersion: "0" })]); return { rows: [{ operation_id: "correction" }] };
  } });
  await repository.promote({ key: "correction", manifestId: "00000000-0000-4000-8000-000000000012", expectedGeneration: "2", expectedHealthVersion: "0", verified, admissionId: "00000000-0000-4000-8000-000000000011", envelopeDigest: envelope.digest, badOperationId: "00000000-0000-4000-8000-000000000099", badGenerationRecordId: "00000000-0000-4000-8000-000000000098", expectedLineage: digest("c") });
  assert.match(calls[0], /^SELECT public\.link_forward_correction\(\$1::jsonb\) AS result$/); assert.match(calls[1], /^SELECT public\.promote_delta\(\$1::jsonb\) AS operation_id$/);
});
