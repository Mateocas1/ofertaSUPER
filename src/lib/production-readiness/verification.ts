import { z } from "zod";
import { canonicalize, canonicalProof, sha256, sha256Canonical } from "./canonical";

import type { SourceCapture } from "./operations";

type Facts = Record<string, unknown>;
type Item = { entity: SourceCapture["items"][number]["entity"]; key: string; facts: Facts };
type Input = {
	verifier: { credential: string; snapshot: string };
	capture: SourceCapture;
	actual: Item[];
	policy: { digest: string; permittedFields: string[]; maximumSourceAgeMs: number };
	predecessor: { generation: number; digest: string; facts: Facts };
	evidence: { bytes: string; sha256: string } | null;
	lineage: { predecessor: string; result: string };
	verifiedAt: string;
	producerPass?: boolean;
	verifierFailure?: string;
};

export function verifyCommittedSourceDelta(input: Input) {
	validateSeal(input);
	const result = { ...input.predecessor.facts };
	for (const captured of input.capture.items) copyVerifiedFields(input, captured, result);
	return { status: "SEALED_SOURCE_ONLY" as const, observedAt: input.capture.observedAt, verifiedAt: input.verifiedAt, predecessor: input.predecessor, result: { facts: result }, policyDigest: input.policy.digest };
}

function validateSeal(input: Input) {
	if (input.producerPass || input.verifierFailure) fail("producer assertion or verifier failure");
	if (input.verifier.credential !== "verifier/read-only") fail("separate read-only credential is required");
	if (!input.verifier.snapshot.startsWith("committed:")) fail("committed snapshot is required");
	if (!input.evidence || sha256(input.evidence.bytes) !== input.evidence.sha256) fail("evidence verification failed");
	if (input.lineage.predecessor !== input.predecessor.digest || !input.lineage.result.startsWith("sha256:")) fail("lineage verification failed");
	const observed = date(input.capture.observedAt, "observation");
	const verified = date(input.verifiedAt, "verification");
	if (verified.getTime() - observed.getTime() > input.policy.maximumSourceAgeMs || verified < observed) fail("source age verification failed");
}

function copyVerifiedFields(input: Input, captured: SourceCapture["items"][number], result: Facts) {
	const actual = input.actual.find((item) => item.entity === captured.entity && item.key === captured.key);
	if (!actual || !captured.after) fail("committed source drift verification failed");
	for (const field of input.policy.permittedFields) {
		if (!Object.is(actual.facts[field], captured.after[field])) fail("committed source drift verification failed");
		result[field] = captured.after[field];
	}
}

function date(value: string, kind: string) { const parsed = new Date(value); if (Number.isNaN(parsed.getTime())) fail(`${kind} time verification failed`); return parsed; }
function fail(reason: string): never { throw new Error(`source verification failed: ${reason}`); }

const hash = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const counter = z.string().regex(/^(0|[1-9][0-9]*)$/);
const entity = z.enum(["product", "offer", "history"]);
const facts = z.record(z.string(), z.unknown()).nullable();
const identity = z.object({ entity, key: z.string() });
const observation = identity.extend({ facts }).strict();
const captureItem = identity.extend({ before: facts, after: facts }).strict();
const bindingSchema = z.object({ candidateDigest: hash, incarnation: z.uuid(), policyDigest: hash, buildDigest: hash,
  healthVersion: counter, predecessorGeneration: counter, predecessorLineage: hash }).strict();
const governedInput = z.object({
  verifier: z.object({ credential: z.literal("verifier/read-only"), snapshot: z.string().regex(/^committed:.+/), resultDigest: hash }).strict(),
  capture: z.object({ operationKey: z.string().regex(/^source-capture\/v1:sha256:[a-f0-9]{64}$/), source: z.string(),
    observedAt: z.iso.datetime(), items: z.array(captureItem).min(1) }).strict(),
  binding: bindingSchema.extend({ deltaDigest: hash }).strict(),
  current: z.object({ binding: bindingSchema, items: z.array(observation) }).strict(),
  actual: z.array(observation), evidence: z.object({ bytes: z.string().min(1), sha256: hash }).strict(), verifiedAt: z.iso.datetime(),
  policy: z.object({ version: z.literal("refresh-policy/v1"), source: z.enum(["carrefour", "vea", "disco", "jumbo", "mas"]),
    fields: z.object({ product: z.array(z.string()), offer: z.array(z.string()), history: z.array(z.string()) }).strict(),
    mutations: z.array(z.enum(["update", "insert", "delete"])), maximumSourceAgeMs: z.number().int().nonnegative() }).strict(),
}).strict();
type GovernedInput = z.infer<typeof governedInput>;
type CapturedItem = z.infer<typeof captureItem>;
const verifiedEnvelopes = new WeakMap<object, Readonly<{ bytes: string; digest: string }>>();

/** Trusted verifier entry: adapters supply complete current rows and independent observations.
 * Credential labels/hashes are not authentication. This pure seam performs no I/O or durable admission. */
export function verifyGovernedDelta(input: unknown) {
  const data = governedInput.parse(input);
  const captured = keyed(data.capture.items);
  const current = keyed(data.current.items);
  const actual = keyed(data.actual);
  const { deltaDigest, ...binding } = data.binding;
  if (canonicalize(binding) !== canonicalize(data.current.binding)) fail("predecessor binding conflict");
  if (data.policy.source !== data.capture.source || sha256Canonical(data.policy) !== binding.policyDigest) fail("policy binding conflict");
  const capture = { ...data.capture, items: [...captured.values()] };
  if (sha256Canonical(capture) !== deltaDigest) fail("delta binding conflict");
  if (sha256(data.evidence.bytes) !== data.evidence.sha256) fail("evidence mismatch");
  if ([data.verifiedAt, capture.observedAt].some((value) => new Date(value).toISOString() !== value)) fail("noncanonical observation time");
  const elapsed = Date.parse(data.verifiedAt) - Date.parse(capture.observedAt);
  if (elapsed < 0 || elapsed > data.policy.maximumSourceAgeMs) fail("source age invalid");
  if (canonicalize([...captured.keys()]) !== canonicalize([...current.keys()])
    || canonicalize([...captured.keys()]) !== canonicalize([...actual.keys()])) fail("complete key observations required");
  const items = [...captured].map(([key, item]) => deriveGovernedItem(item, current.get(key)!.facts, actual.get(key)!.facts, data.policy));
  const payload = { version: "promotion-ready-envelope/v1", binding: data.binding, verifier: data.verifier,
    observedAt: capture.observedAt, verifiedAt: data.verifiedAt, evidenceDigest: data.evidence.sha256, capture, items };
  const handle = Object.freeze({ status: "VERIFIED_GOVERNED_INPUT" as const });
  verifiedEnvelopes.set(handle, canonicalProof(payload));
  return handle;
}

/** Only a handle issued by the verifier above is accepted; copied JSON is not verified proof. */
export function createPromotionReadyEnvelope(verified: unknown) {
  const result = verified && typeof verified === "object" ? verifiedEnvelopes.get(verified) : undefined;
  if (!result) fail("verified governed handle required");
  return result;
}

function keyed<T extends { entity: z.infer<typeof entity>; key: string }>(rows: T[]) {
  const result = new Map<string, T>();
  for (const row of rows) {
    const key = JSON.parse(row.key);
    const names = row.entity === "product" ? ["ean"] : row.entity === "offer" ? ["product_ean", "supermarket_id"] : ["id"];
    if (!key || canonicalize(key) !== row.key || canonicalize(Object.keys(key).sort()) !== canonicalize(names)
      || names.some((name) => typeof key[name] !== "string" || !/^[0-9]+$/.test(key[name])
        || (!name.includes("ean") && !/^[1-9][0-9]*$/.test(key[name])))) fail("noncanonical typed key");
    const id = `${row.entity}:${row.key}`;
    if (result.has(id)) fail("duplicate key conflict");
    result.set(id, row);
  }
  return new Map([...result].sort(([, a], [, b]) => {
    if (a.entity !== b.entity) return a.entity < b.entity ? -1 : 1;
    const left = JSON.parse(a.key), right = JSON.parse(b.key);
    for (const field of Object.keys(left)) {
      const x = field.includes("ean") ? left[field] as string : BigInt(left[field]);
      const y = field.includes("ean") ? right[field] as string : BigInt(right[field]);
      if (x !== y) return x < y ? -1 : 1;
    }
    return 0;
  }));
}

function deriveGovernedItem(item: CapturedItem, before: Facts | null, actual: Facts | null, policy: GovernedInput["policy"]) {
  const mutation = item.before === null ? "insert" : item.after === null ? "delete" : "update";
  if (!policy.mutations.includes(mutation)) fail("policy mutation denied");
  if ((mutation === "insert") !== (before === null) || (mutation === "insert" && item.after === null)) fail("predecessor existence conflict");
  if (item.after === null ? actual !== null : actual === null || Object.keys(item.after).some((key) => !(key in actual) || canonicalize(actual[key]) !== canonicalize(item.after![key]))) fail("committed source drift");
  if (mutation !== "insert" && canonicalize(Object.keys(item.before!).sort()) !== canonicalize(Object.keys(item.after ?? item.before!).sort())) fail("incomplete source fields");
  const fields = mutation === "update" ? Object.keys(item.after!).filter((key) => canonicalize(item.before![key]) !== canonicalize(item.after![key])).sort() : Object.keys(item.after ?? item.before!).sort();
  if (!fields.length || (mutation !== "delete" && fields.some((key) => !policy.fields[item.entity].includes(key)))) fail("unverifiable field");
  if (mutation === "delete" ? canonicalize(before) !== canonicalize(item.before) : mutation === "update" && fields.some((key) => !before || !(key in before) || canonicalize(before[key]) !== canonicalize(item.before![key]))) fail("governed predecessor conflict");
  const after = mutation === "delete" ? null : { ...before, ...Object.fromEntries(fields.map((key) => [key, actual![key]])) };
  for (const image of [before, after]) {
    if (image === null) continue;
    if (Object.entries(JSON.parse(item.key)).some(([key, value]) => image[key] !== value)) fail("image key conflict");
    for (const key of Object.keys(image)) {
      if (/^(price|list_price|reference_price|discount_value)$/.test(key) && image[key] !== null
        && (typeof image[key] !== "string" || !/^-?(0|[1-9][0-9]*)\.[0-9]{2}$/.test(image[key] as string))) fail("noncanonical decimal");
    }
  }
  return { entity: item.entity, key: item.key, before, after, tombstone: after === null, fields };
}
