import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";

const identity = {
  version: 1,
  target: "production",
  publicationId: "publication-original",
  deploymentId: "deployment-original",
  commitSha: "a".repeat(40),
  candidateDigest: `sha256:${"b".repeat(64)}`,
};
const replacementIdentity = {
  ...identity,
  publicationId: "publication-replacement",
  deploymentId: "deployment-replacement",
};

type ChildResult = {
  result: unknown;
  queryIds: string[];
};

function runBootstrap(initialIdentity: string | undefined, replacement: string, rejectDatabaseImport: boolean): ChildResult {
  const databaseModule = `
    const identity = JSON.parse(process.env.TEST_BOOTSTRAP_IDENTITY);
    const queryIds = [];
    export const db = { productionReadinessPublication: { findUnique: async ({ where }) => {
      queryIds.push(where.id);
      const now = Date.now();
      return {
        id: identity.publicationId, target: "production", state: "PROMOTED",
        verified_at: new Date(now - 60 * 60 * 1000), promotion_id: "promotion-1",
        promotion: {
          id: "promotion-1", state: "PROMOTED", deployment_id: identity.deploymentId,
          commit_sha: identity.commitSha, candidate_digest: identity.candidateDigest,
          expires_at: new Date(now + 60 * 60 * 1000),
        },
      };
    } } };
    export { queryIds };
  `;
  const loader = `
    const databaseModule = ${JSON.stringify(`data:text/javascript,${encodeURIComponent(databaseModule)}`)};
    export async function resolve(specifier, context, nextResolve) {
      if (specifier === "@/lib/db") {
        ${rejectDatabaseImport ? "throw new Error('unexpected database import');" : "return { url: databaseModule, shortCircuit: true };"}
      }
      return nextResolve(specifier, context);
    }
  `;
  const script = `
    import { register } from "node:module";
    register(${JSON.stringify(`data:text/javascript,${encodeURIComponent(loader)}`)}, import.meta.url);
    if (process.env.TEST_INITIAL_IDENTITY === "__unset__") delete process.env.PUBLIC_CATALOG_SERVING_IDENTITY_JSON;
    else process.env.PUBLIC_CATALOG_SERVING_IDENTITY_JSON = process.env.TEST_INITIAL_IDENTITY;
    const runtime = await import("./src/lib/public-catalog-runtime.server.ts");
    const resolve = runtime.resolvePublicCatalogRuntimeAuthority
      ?? runtime.default?.resolvePublicCatalogRuntimeAuthority;
    process.env.PUBLIC_CATALOG_SERVING_IDENTITY_JSON = process.env.TEST_REPLACEMENT_IDENTITY;
    const result = await resolve();
    const database = ${rejectDatabaseImport ? "null" : "await import(\"@/lib/db\")"};
    console.log(JSON.stringify({ result, queryIds: database?.queryIds ?? [] }));
  `;
  const child = spawnSync(process.execPath, [
    "--import", "tsx", "--conditions=react-server", "--input-type=module", "--eval", script,
  ], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      TEST_BOOTSTRAP_IDENTITY: JSON.stringify(identity),
      TEST_INITIAL_IDENTITY: initialIdentity ?? "__unset__",
      TEST_REPLACEMENT_IDENTITY: replacement,
    },
  });

  assert.equal(child.status, 0, child.stderr);
  return JSON.parse(child.stdout) as ChildResult;
}

describe("public catalog runtime bootstrap", () => {
  it("denies missing and invalid startup identities without importing the database", () => {
    for (const startupIdentity of [undefined, "{"]) {
      const output = runBootstrap(startupIdentity, JSON.stringify(replacementIdentity), true);
      assert.equal(output.result, null);
      assert.deepEqual(output.queryIds, []);
    }
  });

  it("binds a valid startup identity once and queries its exact publication", () => {
    const output = runBootstrap(JSON.stringify(identity), JSON.stringify(replacementIdentity), false);

    assert.deepEqual(output.queryIds, [identity.publicationId]);
    assert.match(JSON.stringify(output.result), new RegExp(identity.publicationId));
    assert.doesNotMatch(JSON.stringify(output.result), new RegExp(replacementIdentity.publicationId));
  });
});
