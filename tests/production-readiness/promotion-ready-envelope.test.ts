import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalize, sha256, sha256Canonical } from "../../src/lib/production-readiness/canonical";
import { createPromotionReadyEnvelope, verifyGovernedDelta } from "../../src/lib/production-readiness/verification";

function fixture() {
  const key = canonicalize({ ean: "12345678" });
  const policy = { version: "refresh-policy/v1", source: "vea", fields: { product: ["ean", "name"], offer: [], history: [] },
    mutations: ["update", "insert", "delete"], maximumSourceAgeMs: 60000 };
  const capture = { operationKey: "source-capture/v1:" + sha256("operation"), source: "vea", observedAt: "2026-06-01T00:00:00.000Z",
    items: [{ entity: "product", key, before: { ean: "12345678", name: "old" }, after: { ean: "12345678", name: "new" } }] };
  const binding = { candidateDigest: sha256("candidate"), incarnation: "00000000-0000-4000-8000-000000000001",
    policyDigest: sha256Canonical(policy), buildDigest: sha256("build"), healthVersion: "2", predecessorGeneration: "7", predecessorLineage: sha256("lineage") };
  return { verifier: { credential: "verifier/read-only", snapshot: "committed:42", resultDigest: sha256("verified result") }, capture, policy,
    binding: { ...binding, deltaDigest: sha256Canonical(capture) },
    current: { binding, items: [{ entity: "product", key, facts: { ean: "12345678", name: "old", brand: "governed" } }] },
    actual: [{ entity: "product", key, facts: { ean: "12345678", name: "new", brand: "source-only" } }],
    evidence: { bytes: "independent postwrite proof", sha256: sha256("independent postwrite proof") }, verifiedAt: "2026-06-01T00:00:30.000Z" };
}
function envelope(input: unknown) { return createPromotionReadyEnvelope(verifyGovernedDelta(input)); }

test("derives per-key governed images and rejects caller-asserted or merged-only verification", () => {
  const input = fixture();
  const result = envelope(input);
  const body = JSON.parse(result.bytes);
  assert.deepEqual(body.items[0].before, input.current.items[0].facts);
  assert.deepEqual(body.items[0].after, { ean: "12345678", name: "new", brand: "governed" });
  assert.deepEqual(body.items[0].fields, ["name"]);
  assert.equal(body.items[0].tombstone, false);
  assert.deepEqual(body.binding, input.binding);
  assert.equal(body.evidenceDigest, input.evidence.sha256);
  assert.equal(result.digest, sha256(result.bytes));
  assert.throws(() => createPromotionReadyEnvelope({ status: "SEALED_SOURCE_ONLY", result: { facts: {} } }), /verified/);
  assert.throws(() => envelope({ ...input, after: { name: "asserted" } }));
  assert.throws(() => envelope({ ...input, current: { facts: input.current.items[0].facts } }));
  assert.throws(() => envelope({ ...input, rescan: () => { throw new Error("must not execute"); } }));
});

test("rejects missing or mismatched bindings, evidence, policy and source observations", () => {
  const input = fixture();
  for (const key of Object.keys(input.binding)) {
    const binding: Record<string, unknown> = { ...input.binding };
    delete binding[key];
    assert.throws(() => envelope({ ...input, binding }), key);
    assert.throws(() => envelope({ ...input, binding: { ...input.binding, [key]: key.endsWith("Digest") || key.endsWith("Lineage") ? sha256("other") : "9" } }), key);
  }
  assert.throws(() => envelope({ ...input, evidence: null }));
  assert.throws(() => envelope({ ...input, evidence: { ...input.evidence, bytes: "tampered" } }), /evidence/);
  assert.throws(() => envelope({ ...input, policy: { ...input.policy, mutations: [] } }), /policy/);
  assert.throws(() => envelope({ ...input, actual: [{ ...input.actual[0], facts: { name: "drift" } }] }), /source/);
  assert.throws(() => envelope({ ...input, verifier: { credential: "producer/write", snapshot: "committed:42", resultDigest: input.verifier.resultDigest } }), /verifier/);
});

test("rejects duplicate, noncanonical, incomplete and unverified keyed facts", () => {
  const input = fixture();
  assert.throws(() => envelope({ ...input, actual: [...input.actual, input.actual[0]] }), /duplicate/);
  assert.throws(() => envelope({ ...input, current: { ...input.current, items: [] } }), /key/);
  assert.throws(() => envelope({ ...input, actual: [{ ...input.actual[0], key: '{ "ean": "12345678" }' }] }), /canonical/);
  const captured = { ...input.capture.items[0], after: { ...input.capture.items[0].after, brand: "unverified" } };
  const capture = { ...input.capture, items: [captured] };
  assert.throws(() => envelope({ ...input, capture, binding: { ...input.binding, deltaDigest: sha256Canonical(capture) } }));
});

test("verifies explicit inserts and deletions without assuming absence or copying caller images", () => {
  const input = fixture();
  for (const mutation of ["insert", "delete"]) {
    const captured = { ...input.capture.items[0], before: mutation === "insert" ? null : input.current.items[0].facts,
      after: mutation === "delete" ? null : input.capture.items[0].after };
    const capture = { ...input.capture, items: [captured] };
    const variant = { ...input, capture, binding: { ...input.binding, deltaDigest: sha256Canonical(capture) },
      current: { ...input.current, items: [{ ...input.current.items[0], facts: mutation === "insert" ? null : input.current.items[0].facts }] },
      actual: [{ ...input.actual[0], facts: mutation === "delete" ? null : captured.after }] };
    const body = JSON.parse(envelope(variant).bytes);
    assert.equal(body.items[0].tombstone, mutation === "delete");
    assert.deepEqual(body.items[0].before, variant.current.items[0].facts);
    assert.deepEqual(body.items[0].after, captured.after);
    assert.throws(() => envelope({ ...variant, actual: [] }), /key/);
    assert.throws(() => envelope({ ...variant, current: input.current, actual: input.actual }), /predecessor|source/);
  }
});

test("verified handles and canonical output cannot be mutated or forged after construction", () => {
  const input = fixture();
  const verified = verifyGovernedDelta(input);
  const original = createPromotionReadyEnvelope(verified);
  input.current.items[0].facts.name = "corrupted";
  input.capture.items[0].after.name = "corrupted";
  assert.deepEqual(createPromotionReadyEnvelope(verified), original);
  assert.throws(() => createPromotionReadyEnvelope({ ...verified }), /verified/);
  assert.ok(Object.isFrozen(original));
  assert.equal(Reflect.set(original, "bytes", "tampered"), false);
  assert.equal(Reflect.set(verified, "status", "forged"), false);
});


test("permuted batches preserve distinct keyed images and a reproducible canonical proof", () => {
  const input = fixture();
  const captured = ["12345678", "22345678", "32345678"].map((ean, index) => ({ ...input.capture.items[0],
    key: canonicalize({ ean }), before: { ean, name: `old-${index}` }, after: { ean, name: `new-${index}` } }));
  const current = captured.map((item) => ({ entity: item.entity, key: item.key, facts: { ...item.before, brand: item.key } }));
  const actual = captured.map((item) => ({ entity: item.entity, key: item.key, facts: item.after }));
  const capture = { ...input.capture, items: captured };
  const binding = { ...input.binding, deltaDigest: sha256Canonical(capture) };
  const expected = envelope({ ...input, capture, binding, current: { ...input.current, items: current }, actual });
  for (const order of [[2, 1, 0], [1, 0, 2], [1, 2, 0], [0, 2, 1], [2, 0, 1]]) {
    const result = envelope({ ...input, binding, capture: { ...capture, items: order.map((i) => captured[i]) },
      current: { ...input.current, items: order.map((i) => current[i]) }, actual: order.map((i) => actual[i]) });
    assert.deepEqual(result, expected);
  }
  const items = JSON.parse(expected.bytes).items;
  assert.equal(items.length, 3);
  assert.deepEqual(items.map((item: { after: { name: string } }) => item.after.name), ["new-0", "new-1", "new-2"]);
  assert.throws(() => envelope({ ...input, capture: { ...capture, items: [captured[0], captured[0]] }, binding }), /duplicate/);
});

test("canonical scalar, policy, predecessor and observation boundaries fail closed", () => {
  const input = fixture();
  for (const facts of [{ ...input.current.items[0].facts, price: "01.20" }, { ...input.current.items[0].facts, price: 1.25 },
    { ...input.current.items[0].facts, name: "unexplained" }]) {
    assert.throws(() => envelope({ ...input, current: { ...input.current, items: [{ ...input.current.items[0], facts }] } }));
  }
  for (const verifiedAt of ["2026-06-01T00:00:30Z", "2026-05-31T23:59:59.000Z", "2026-06-01T00:02:00.000Z"]) {
    assert.throws(() => envelope({ ...input, verifiedAt }), /canonical|age/);
  }
  const policy = { ...input.policy, mutations: ["insert"] };
  const policyDigest = sha256Canonical(policy);
  assert.throws(() => envelope({ ...input, policy, binding: { ...input.binding, policyDigest },
    current: { ...input.current, binding: { ...input.current.binding, policyDigest } } }), /mutation denied/);
});


test("canonical history keys use lossless numeric ordering and preserve original fact times", () => {
  const input = fixture();
  const policy = { ...input.policy, fields: { ...input.policy.fields, history: ["price"] } };
  const policyDigest = sha256Canonical(policy);
  const items = ["10000000000000001", "2"].map((id) => ({ entity: "history", key: canonicalize({ id }),
    before: { id, price: "10.00", scraped_at: "2026-05-31T00:00:00.000Z" },
    after: { id, price: "11.00", scraped_at: "2026-05-31T00:00:00.000Z" } }));
  const capture = { ...input.capture, items };
  const result = envelope({ ...input, policy, capture,
    binding: { ...input.binding, policyDigest, deltaDigest: sha256Canonical({ ...capture, items: [...items].reverse() }) },
    current: { binding: { ...input.current.binding, policyDigest }, items: items.map((item) => ({ entity: item.entity, key: item.key, facts: item.before })) },
    actual: items.map((item) => ({ entity: item.entity, key: item.key, facts: item.after })) });
  const body = JSON.parse(result.bytes);
  assert.deepEqual(body.items.map((item: { after: { id: string } }) => item.after.id), ["2", "10000000000000001"]);
  assert.equal(body.items[1].after.scraped_at, items[0].before.scraped_at);
  assert.equal(body.items[0].after.price, "11.00");
});
