import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { createAuthorityRoute } from "../../src/lib/production-readiness/operations";

const activation = { key: "op-1", reservationId: "r-1", approvalId: "a-1", verificationId: "v-1", attemptId: "b-1", expectedEpoch: "0", expectedVersion: 0, expectedGeneration: null };
const inspection = { operationId: "op-1", reservationId: "r-1" };
function request(body: unknown, headers = {}) {
  return new Request("https://example.test/api/admin/catalog-authority/activate", { method: "POST", headers: { "content-type": "application/json", origin: "https://example.test", "sec-fetch-site": "same-origin", ...headers }, body: JSON.stringify(body) });
}

test("guarded lifecycle routes validate before effect and preserve committed-only responses", async () => {
  const calls: unknown[] = [];
  const dependencies = {
    access: async () => ({ principal: { userId: "executor", sessionId: "session" } }),
    execute: async (query: string, values: unknown[]) => {
      calls.push([query, values]);
      if (query.includes(" AS domain") || query.includes("authority_candidates")) return { rows: [{ domain: "example.test" }] };
      return { rows: [query.includes("inspect_authority") ? { result: { operationId: "op-1", eligible: false, reason: "ineligible", proof: { expiresAt: "original" } } } : { operation_id: "op-1" }] };
    },
  };
  const activate = createAuthorityRoute("activate", dependencies);
  assert.deepEqual(await (await activate(request(activation))).json(), { operationId: "op-1" });
  assert.equal(JSON.parse(String((calls[1] as [string, unknown[]])[1][0])).actorId, "executor");
  const inspect = createAuthorityRoute("inspect", dependencies);
  const recovered = await inspect(request(inspection));
  assert.equal(recovered.status, 200);
  assert.equal((await recovered.json()).eligible, false);
  assert.equal(recovered.headers.get("cache-control"), "private, no-store");
  for (const body of [null, [], {}, { ...activation, actorId: "forged" }, { ...activation, expectedVersion: -1 }, { ...activation, expectedEpoch: "1e9" }, { ...activation, expectedGeneration: "0" }, { ...activation, key: "x".repeat(257) }]) {
    const before = calls.length;
    assert.equal((await activate(request(body))).status, 400);
    assert.equal(calls.length, before);
  }
  for (const headers of [{ origin: "https://attacker.test" }, { "sec-fetch-site": "cross-site" }, { "sec-fetch-site": "" }]) {
    assert.equal((await activate(request(activation, headers))).status, 403);
  }
  assert.equal((await activate(request(activation, { "content-type": "text/plain" }))).status, 415);
  const denied = createAuthorityRoute("inspect", { ...dependencies, access: async () => ({ denied: Response.json({}, { status: 401 }) }) });
  const before = calls.length;
  assert.equal((await denied(request(inspection))).status, 401);
  assert.equal(calls.length, before);
});

test("adopt ingress is guarded, exact, and sends no publisher proof", async () => {
  const adoption = { key: "adopt-1", publicationId: "publication-1", expectedGeneration: "0", expectedLineage: `sha256:${"a".repeat(64)}`,
    expectedHealthVersion: "0", expectedBuildDigest: `sha256:${"b".repeat(64)}`, expectedPolicyDigest: `sha256:${"c".repeat(64)}` };
  const calls: [string, unknown[]][] = [];
  const adopt = createAuthorityRoute("adopt", { access: async () => ({ principal: { userId: "executor", sessionId: "session" } }), execute: async (query, values) => {
    calls.push([query, values]);
    return { rows: query.includes("SELECT c.domain") ? [{ domain: "example.test" }] : [{ operation_id: "adopt-1" }] };
  } });
  assert.deepEqual(await (await adopt(request(adoption))).json(), { operationId: "adopt-1" });
  assert.match(calls[0][0], /production_readiness_publications/);
  assert.deepEqual(JSON.parse(String(calls[1][1][0])), adoption);
  for (const invalid of [{ ...adoption, publisher: {} }, { ...adoption, expectedLineage: "bad" }, { ...adoption, expectedGeneration: "01" }]) {
    const before = calls.length;
    assert.equal((await adopt(request(invalid))).status, 400);
    assert.equal(calls.length, before);
  }
  for (const headers of [{ origin: "https://evil.test" }, { "sec-fetch-site": "cross-site" }, { "content-type": "text/plain" }]) {
    assert.notEqual((await adopt(request(adoption, headers))).status, 200);
  }
  for (const [message, status] of [["stale existing LIVE generation binding", 409], ["existing LIVE adoption drift conflict", 409], ["late-ineligible existing LIVE adoption requires forward recovery", 422], ["connection lost", 503]] as const) {
    const failed = createAuthorityRoute("adopt", { access: async () => ({ principal: { userId: "executor", sessionId: "session" } }), execute: async (query) => {
      if (query.includes("SELECT c.domain")) return { rows: [{ domain: "example.test" }] };
      throw new Error(message);
    } });
    assert.equal((await failed(request(adoption))).status, status);
  }
});

test("revoke ingress requires exact consent identifiers and derives the session proof", async () => {
  const body = { key: "revoke-1", operationId: "op-1", reservationId: "r-1", consentId: "consent-1", expectedVersion: 1 };
  const principal = { userId: "executor", sessionId: "session" };
  let effect = 0;
  const dependencies = { access: async () => ({ principal }), execute: async (query: string, values: unknown[]) => {
    if (query.includes(" AS domain")) return { rows: [{ domain: "example.test" }] };
    effect++;
    assert.deepEqual(JSON.parse(String(values[0])), { ...body, actorId: principal.userId,
      sessionHash: createHash("sha256").update(JSON.stringify(principal)).digest("hex") });
    return { rows: [{ operation_id: "revoke-1" }] };
  } };
  const revoke = createAuthorityRoute("revoke", dependencies);
  assert.deepEqual(await (await revoke(request(body))).json(), { operationId: "revoke-1" });
  for (const invalid of [{ ...body, consentId: undefined }, { ...body, expectedVersion: -1 }, { ...body, sessionHash: "forged" }, { ...body, actorId: "forged" }, { ...body, reason: "unreviewed" }]) {
    assert.equal((await revoke(request(invalid))).status, 400);
  }
  for (const status of [401, 403]) {
    const denied = createAuthorityRoute("revoke", { ...dependencies, access: async () => ({ denied: Response.json({}, { status }) }) });
    assert.equal((await denied(request(body))).status, status);
  }
  assert.equal((await revoke(request(body, { origin: "https://evil.test" }))).status, 403);
  assert.equal((await revoke(request(body, { "sec-fetch-site": "cross-site" }))).status, 403);
  assert.equal((await revoke(request(body, { "content-type": "text/plain" }))).status, 415);
  assert.equal(effect, 1);
  for (const [message, status] of [["revoke consent not found", 404], ["revoke binding conflict", 409], ["revoke consent replay conflict", 409],
    ["revoke consent proof invalid", 403], ["original revoke grant required", 403], ["final revoke grant expired", 403], ["final revoke consent expired", 422], ["connection lost", 503]] as const) {
    const failure = createAuthorityRoute("revoke", { ...dependencies, execute: async (query: string) => {
      if (query.includes(" AS domain")) return { rows: [{ domain: "example.test" }] };
      throw new Error(message);
    } });
    assert.equal((await failure(request(body))).status, status);
  }
});

test("lifecycle routes distinguish missing, conflict, forbidden, ineligible and unknown outcomes", async () => {
  for (const [message, status] of [["reservation required", 404], ["idempotency conflict", 409], ["reservation conflict", 409], ["live scoped executor grant required", 403], ["final DB-clock validity check failed", 422], ["connection lost", 503]] as const) {
    const handler = createAuthorityRoute("activate", {
      access: async () => ({ principal: { userId: "executor", sessionId: "session" } }),
      execute: async (query: string) => {
        if (query.includes("authority_candidates")) return { rows: [{ domain: "example.test" }] };
        throw new Error(message);
      },
    });
    assert.equal((await handler(request(activation))).status, status);
  }
});
