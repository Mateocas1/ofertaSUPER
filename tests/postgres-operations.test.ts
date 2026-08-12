import assert from "node:assert/strict";
import test from "node:test";
import { deployMigrations, migrationInvocation, renderBootstrapSql } from "../scripts/postgres-operations";

const names = { database: "ofertasuper", owner: "ofertasuper_owner", app: "ofertasuper_app" };

test("renders deterministic least-privilege grants for existing and future objects", () => {
  const sql = renderBootstrapSql(names);
  assert.equal(sql, renderBootstrapSql(names));
  assert.match(sql, /GRANT CONNECT ON DATABASE "ofertasuper"/);
  assert.match(sql, /REVOKE CREATE ON SCHEMA "public" FROM "ofertasuper_app"/);
  assert.match(sql, /GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES/);
  assert.match(sql, /GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES/);
  assert.match(sql, /ALTER DEFAULT PRIVILEGES FOR ROLE "ofertasuper_owner"/);
  assert.doesNotMatch(sql, /SUPERUSER|CREATEDB|CREATEROLE|BYPASSRLS|PASSWORD/);
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

test("migration launch requires DIRECT_URL", () => {
  assert.throws(() => migrationInvocation({ DATABASE_URL: "postgresql://pool/db" }), /DIRECT_URL/);
  assert.throws(() => migrationInvocation({ DIRECT_URL: "not-a-url" }), /valid PostgreSQL URL/);
  assert.throws(() => migrationInvocation({ DIRECT_URL: "https://example.com/db" }), /valid PostgreSQL URL/);
});
