import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";

const fingerprint = {
  publicationId: "pub-1", promotionId: "promotion-1", target: "production",
  deploymentId: "domain-deployment-1", commitSha: "a".repeat(40),
  candidateDigest: `sha256:${"b".repeat(64)}`, verifiedAt: "2020-01-01T00:00:00.000Z",
  expiresAt: "2099-01-01T00:00:00.000Z",
};

type Scenario = { secret?: string; authorization?: string; nonce?: string; authority?: unknown };
function invoke(scenario: Scenario) {
  const databaseModule = `
    let calls = 0;
    export const db = { productionReadinessPublication: { findUnique: async () => {
      calls += 1;
      if (process.env.TEST_AUTHORITY === "null") return null;
      const fingerprint = JSON.parse(process.env.TEST_AUTHORITY);
      return { id: fingerprint.publicationId, target: "production", state: "PROMOTED", verified_at: new Date(fingerprint.verifiedAt), promotion_id: fingerprint.promotionId,
        promotion: { id: fingerprint.promotionId, state: "PROMOTED", deployment_id: fingerprint.deploymentId, commit_sha: fingerprint.commitSha,
          candidate_digest: fingerprint.candidateDigest, expires_at: new Date(fingerprint.expiresAt) } };
    } } };
    export function getCalls() { return calls; }
  `;
  const loader = `
    const database = ${JSON.stringify(`data:text/javascript,${encodeURIComponent(databaseModule)}`)};
    export async function resolve(specifier, context, nextResolve) {
      if (specifier === "@/lib/db") return { url: database, shortCircuit: true };
      return nextResolve(specifier, context);
    }
  `;
  const script = `
    import { register } from "node:module";
    register(${JSON.stringify(`data:text/javascript,${encodeURIComponent(loader)}`)}, import.meta.url);
    process.env.PUBLIC_CATALOG_SERVING_IDENTITY_JSON = JSON.stringify({ version: 1, target: "production", publicationId: "pub-1", deploymentId: "domain-deployment-1", commitSha: "${"a".repeat(40)}", candidateDigest: "sha256:${"b".repeat(64)}" });
    const route = await import("./src/app/api/internal/catalog-serving-identity-proof/route.ts");
    const get = route.GET ?? route.default?.GET;
    const headers = process.env.TEST_AUTHORIZATION ? { authorization: process.env.TEST_AUTHORIZATION } : {};
    const request = new Request("https://app.example/api/internal/catalog-serving-identity-proof?nonce=" + encodeURIComponent(process.env.TEST_NONCE), { headers });
    const response = await get(request);
    const database = await import("@/lib/db");
    console.log(JSON.stringify({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.json(), calls: database.getCalls() }));
  `;
  const child = spawnSync(process.execPath, ["--import", "tsx", "--conditions=react-server", "--input-type=module", "--eval", script], {
    cwd: process.cwd(), encoding: "utf8", env: {
      ...process.env,
      CATALOG_PROMOTION_GUARD_SECRET: scenario.secret ?? "machine-secret",
      TEST_AUTHORIZATION: scenario.authorization ?? "Bearer machine-secret",
      TEST_NONCE: scenario.nonce ?? "nonce-1234567890",
      TEST_AUTHORITY: JSON.stringify(scenario.authority === undefined ? fingerprint : scenario.authority),
    },
  });
  assert.equal(child.status, 0, child.stderr);
  return JSON.parse(child.stdout) as { status: number; headers: Record<string, string>; body: Record<string, unknown>; calls: number };
}

describe("catalog serving identity proof route", () => {
  it("rejects missing configuration before PostgreSQL with a non-secret response", () => {
    const result = invoke({ secret: "", authorization: "Bearer anything" });
    assert.equal(result.status, 503); assert.equal(result.calls, 0);
    assert.doesNotMatch(JSON.stringify(result), /anything/);
  });

  it("rejects missing and invalid bearer credentials before PostgreSQL", () => {
    for (const authorization of ["", "Bearer wrong-secret", "Basic machine-secret"]) {
      const result = invoke({ authorization });
      assert.ok(result.status === 401 || result.status === 403); assert.equal(result.calls, 0);
      assert.doesNotMatch(JSON.stringify(result), /machine-secret|wrong-secret/);
    }
  });

  it("bounds the nonce before PostgreSQL", () => {
    for (const nonce of ["short", "x".repeat(129), "spaces are invalid"]) {
      const result = invoke({ nonce });
      assert.equal(result.status, 400); assert.equal(result.calls, 0);
    }
  });

  it("returns a fresh active proof with only the safe fingerprint and nonce", () => {
    const result = invoke({});
    assert.equal(result.status, 200); assert.equal(result.calls, 1);
    assert.deepEqual(result.body, { active: true, nonce: "nonce-1234567890", fingerprint });
    assert.equal(result.headers["cache-control"], "private, no-store");
  });

  it("returns non-success inactive proof without identity fields", () => {
    const result = invoke({ authority: null });
    assert.equal(result.status, 409); assert.equal(result.calls, 1);
    assert.deepEqual(result.body, { active: false, nonce: "nonce-1234567890" });
    assert.equal(result.headers["cache-control"], "private, no-store");
  });
});
