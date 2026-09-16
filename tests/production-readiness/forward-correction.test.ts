import assert from "node:assert/strict";
import { test } from "node:test";

import { canonicalize, sha256, sha256Canonical } from "../../src/lib/production-readiness/canonical";
import { createPromotionReadyEnvelope, prepareForwardCorrection, verifyGovernedDelta } from "../../src/lib/production-readiness/verification";

const key = canonicalize({ ean: "12345678" });
const freeze = <T>(value: T): T => {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
const original = () => freeze({ source: "vea", items: [{ entity: "product", key,
  before: { ean: "12345678", name: "before", brand: { label: "old-brand" } },
  after: { ean: "12345678", name: "bad", brand: { label: "old-brand" } },
}] });
const current = () => ({ source: "vea", items: [{ entity: "product" as const, key,
  facts: { ean: "12345678", name: "bad", brand: { label: "intervening" } },
}] });
const intent = () => ({ type: "governed-forward-correction/v1" as const, source: "vea" as const, entity: "product" as const, key, fields: ["name"] });

type CorrectionCandidate = { operationKey: string; current: { entity: "product"; key: string; facts: Record<string, unknown> }[]; items: { entity: "product"; key: string; before: Record<string, unknown>; after: Record<string, unknown> }[] };

function freshVerification(candidate: CorrectionCandidate) {
  const policy = { version: "refresh-policy/v1" as const, source: "vea" as const, fields: { product: ["ean", "name", "brand"], offer: [], history: [] },
    mutations: ["update"] as ("update")[], maximumSourceAgeMs: 60_000 };
  const capture = { operationKey: candidate.operationKey, source: "vea", observedAt: "2026-06-01T00:01:00.000Z", items: candidate.items };
  const binding = { candidateDigest: sha256("fresh candidate"), incarnation: "00000000-0000-4000-8000-000000000001",
    policyDigest: sha256Canonical(policy), buildDigest: sha256("build"), healthVersion: "3", predecessorGeneration: "8", predecessorLineage: sha256("current lineage") };
  const evidence = { bytes: "fresh independent correction proof", sha256: sha256("fresh independent correction proof") };
  return { verifier: { credential: "verifier/read-only", snapshot: "committed:43", resultDigest: sha256("fresh verifier result") }, policy,
    capture, binding: { ...binding, deltaDigest: sha256Canonical(capture) }, current: { binding, items: candidate.current },
    actual: candidate.items.map((item) => ({ entity: item.entity, key: item.key, facts: item.after })), evidence, verifiedAt: "2026-06-01T00:01:30.000Z" };
}

test("rejects structurally related historical and restoration intent forms", () => {
  assert.equal(typeof prepareForwardCorrection, "function");
  for (const patch of [
    { historicalPointer: "generation:7" }, { inverse: { name: "before" } }, { restore: original().items[0].before },
    { sourceRestoration: true }, { type: "governed-forward-correction/v2" }, { fields: ["name", "brand"] },
  ]) assert.throws(() => prepareForwardCorrection({ original: original(), current: current(), intent: { ...intent(), ...patch } }), /correction/i);
  assert.throws(() => prepareForwardCorrection({ original: freeze({ source: "vea", items: [{ entity: "product", key, before: null,
    after: { ean: "12345678", name: "bad", brand: "old-brand" } }] }), current: current(), intent: intent() }), /correction/i);
  assert.throws(() => prepareForwardCorrection({ original: freeze({ source: "vea", items: [original().items[0], original().items[0]] }),
    current: current(), intent: intent() }), /correction/i);
});

test("fails closed for missing images and overlapping current edits", () => {
  const missing = freeze({ source: "vea", items: [{ entity: "product", key,
    after: { ean: "12345678", name: "bad", brand: "old-brand" } }] });
  assert.throws(() => prepareForwardCorrection({ original: missing, current: current(), intent: intent() }), /correction/i);
  const overlap = current();
  overlap.items[0].facts.name = "later governed value";
  assert.throws(() => prepareForwardCorrection({ original: original(), current: overlap, intent: intent() }), /correction/i);
});

test("prepares one detached field reversal and requires a fresh verifier result", () => {
  const live = current();
  let calls = 0;
  const verified = prepareForwardCorrection({ original: original(), current: live, intent: intent(), verify: (candidate: CorrectionCandidate) => {
    calls += 1;
    assert.deepEqual(candidate.items[0], { entity: "product", key,
      before: { ean: "12345678", name: "bad", brand: { label: "intervening" } },
      after: { ean: "12345678", name: "before", brand: { label: "intervening" } } });
    return verifyGovernedDelta(freshVerification(candidate));
  } });
  assert.equal(calls, 1);
  assert.equal(Object.isFrozen(live.items[0].facts.brand), false);
  live.items[0].facts.brand.label = "later";
  const envelope = JSON.parse(createPromotionReadyEnvelope(verified).bytes);
  assert.equal(envelope.items[0].after.name, "before");
  assert.deepEqual(envelope.items[0].after.brand, { label: "intervening" });
  assert.equal(envelope.evidenceDigest, sha256("fresh independent correction proof"));
  assert.throws(() => prepareForwardCorrection({ original: original(), current: current(), intent: intent(), verify: () => verified }), /correction/i);

  const stale = verifyGovernedDelta(freshVerification({ operationKey: "source-capture/v1:" + sha256("stale correction"), current: [{ entity: "product", key,
    facts: { ean: "12345678", name: "bad", brand: { label: "other" } } }], items: [{ entity: "product", key,
    before: { ean: "12345678", name: "bad", brand: { label: "other" } }, after: { ean: "12345678", name: "before", brand: { label: "other" } } }] }));
  assert.throws(() => prepareForwardCorrection({ original: original(), current: current(), intent: intent(), verify: () => stale }), /correction/i);
  assert.throws(() => prepareForwardCorrection({ original: original(), current: current(), intent: intent(), verify: () => ({ status: "VERIFIED_GOVERNED_INPUT" }) }), /correction/i);
});
