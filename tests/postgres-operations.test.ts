import assert from "node:assert/strict";
import test from "node:test";
import { deployMigrations, migrationInvocation, renderBootstrapSql } from "../scripts/postgres-operations";

const names = { database: "ofertasuper", owner: "ofertasuper_owner", app: "ofertasuper_app", runtime: "ofertasuper_runtime" };

test("renders deterministic least-privilege grants for existing and future objects", () => {
  const sql = renderBootstrapSql(names);
  assert.equal(sql, renderBootstrapSql(names));
  assert.match(sql, /GRANT CONNECT ON DATABASE "ofertasuper" TO "ofertasuper_app", "ofertasuper_runtime";/);
  assert.match(sql, /GRANT SELECT ON TABLE "public"\."governed_catalogs".*"public"\."serving_memberships" TO "ofertasuper_runtime";/);
  assert.match(sql, /REVOKE CREATE ON SCHEMA "public" FROM PUBLIC, "ofertasuper_app", "ofertasuper_runtime";/);
  assert.match(sql, /REVOKE ALL ON ALL TABLES IN SCHEMA "public" FROM PUBLIC, "ofertasuper_app", "ofertasuper_runtime";/);
  assert.match(sql, /REVOKE ALL ON ALL SEQUENCES IN SCHEMA "public" FROM PUBLIC, "ofertasuper_app", "ofertasuper_runtime";/);
  assert.match(sql, /REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA "public" FROM PUBLIC, "ofertasuper_app", "ofertasuper_runtime";/);
  assert.match(sql, /ALTER DEFAULT PRIVILEGES FOR ROLE "ofertasuper_owner" IN SCHEMA "public" REVOKE ALL ON TABLES FROM PUBLIC, "ofertasuper_app";/);
  assert.match(sql, /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"\."products".*"public"\."direct_refresh_run_ledger" TO "ofertasuper_app";/);
  assert.match(sql, /GRANT USAGE, SELECT ON SEQUENCE "public"\."supermarkets_id_seq".*"public"\."source_health_id_seq" TO "ofertasuper_app";/);
  assert.match(sql, /REVOKE EXECUTE ON FUNCTION "public"\."governed_catalog_begin_baseline"\(text, text, text, bigint\) FROM PUBLIC, "ofertasuper_app", "ofertasuper_runtime";/);
      assert.doesNotMatch(sql, /GRANT EXECUTE ON FUNCTION "public"\."governed_catalog_begin_baseline"\(text, text, text, bigint\) TO "ofertasuper_app";/);
      assert.match(sql, /GRANT EXECUTE ON FUNCTION "public"\."governed_catalog_begin_baseline"\(text, text, text, text, bigint, bigint, timestamptz\) TO "ofertasuper_app";/);
  assert.doesNotMatch(sql, /ALL TABLES.*GRANT|ALL SEQUENCES.*GRANT/);
  assert.doesNotMatch(sql, /ALTER (?:TABLE|SEQUENCE) [^;\n]+, [^;\n]+ OWNER/);
  assert.match(sql, /ALTER DEFAULT PRIVILEGES FOR ROLE "ofertasuper_owner"/);
  assert.match(sql, /NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS/);
  assert.doesNotMatch(sql, /PASSWORD/);
});

test("rejects identifier injection and identical roles", () => {
  assert.throws(() => renderBootstrapSql({ ...names, app: "app; DROP DATABASE x" }), /must match/);
  assert.throws(() => renderBootstrapSql({ ...names, app: names.owner }), /must differ/);
});

test("migration invocation substitutes the direct URL without adding it to argv", () => {
  const direct = "postgresql://secret@example/db";
  const invocation = migrationInvocation({ DATABASE_URL: "postgresql://pool/db", DIRECT_URL: direct });
  assert.deepEqual(invocation.args, ["prisma", "migrate", "deploy"]);
  assert.equal(invocation.env.DATABASE_URL, direct);
  assert.equal(invocation.args.join(" ").includes(direct), false);
});

test("migration launch is injectable and does not run while constructing a plan", () => {
  let calls = 0;
  migrationInvocation({ DIRECT_URL: "postgresql://secret@example/db" });
  assert.equal(calls, 0);
  const status = deployMigrations({ DIRECT_URL: "postgresql://secret@example/db" }, (command, args, options) => {
    calls += 1;
    assert.equal(args.join(" ").includes("secret"), false);
    assert.equal(options.env.DATABASE_URL, "postgresql://secret@example/db");
    return { pid: 1, output: [], stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), status: 0, signal: null };
  });
  assert.equal(status, 0);
  assert.equal(calls, 1);
});

test("app receives only the guarded seven-argument baseline capability", async () => {
  const grants = await import("node:fs/promises").then(({ readFile }) => readFile(new URL("../docker/compose/app-grants.sql", import.meta.url), "utf8"));
  assert.match(grants, /REVOKE EXECUTE ON FUNCTION public\.governed_catalog_begin_baseline\(text, text, text, bigint\) FROM ofertasuper_app/);
  assert.doesNotMatch(grants, /GRANT EXECUTE ON FUNCTION public\.governed_catalog_begin_baseline\(text, text, text, bigint\) TO ofertasuper_app/);
  assert.match(grants, /GRANT EXECUTE ON FUNCTION public\.governed_catalog_begin_baseline\(text, text, text, text, bigint, bigint, timestamptz\) TO ofertasuper_app/);
});

test("repository ACL grants promote_delta only to the authority principal", async () => {
  const grants = await import("node:fs/promises").then(({ readFile }) => readFile(new URL("../docker/compose/app-grants.sql", import.meta.url), "utf8"));
  assert.match(grants, /REVOKE EXECUTE ON FUNCTION public\.promote_delta\(jsonb\) FROM PUBLIC, ofertasuper_app, ofertasuper_runtime, ofertasuper_verifier;/);
  assert.match(grants, /GRANT EXECUTE ON FUNCTION public\.promote_delta\(jsonb\) TO ofertasuper_authority;/);
});

test("migration launch requires DIRECT_URL", () => {
  assert.throws(() => migrationInvocation({ DATABASE_URL: "postgresql://pool/db" }), /DIRECT_URL/);
  assert.throws(() => migrationInvocation({ DIRECT_URL: "not-a-url" }), /valid PostgreSQL URL/);
  assert.throws(() => migrationInvocation({ DIRECT_URL: "https://example.com/db" }), /valid PostgreSQL URL/);
});
