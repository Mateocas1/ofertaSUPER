import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { renderBootstrapSql, renderVerifierAclSql } from "../../scripts/postgres-operations";

const names = {
  database: "ofertasuper",
  owner: "ofertasuper_owner",
  app: "ofertasuper_app",
  runtime: "ofertasuper_runtime",
  verifier: "ofertasuper_verifier",
};

const requiredVerifierSql = renderVerifierAclSql(names);

test("renders one distinct verifier login and verifier-only future admission capability", () => {
  const sql = renderBootstrapSql(names);
  assert.equal(requiredVerifierSql, renderVerifierAclSql(names));
  assert.match(sql, /ALTER ROLE "ofertasuper_verifier" LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;/);
  assert.match(sql, /REVOKE "ofertasuper_verifier" FROM "ofertasuper_app", "ofertasuper_runtime";/);
  assert.match(sql, /REVOKE "ofertasuper_app", "ofertasuper_runtime" FROM "ofertasuper_verifier";/);
  assert.match(sql, /GRANT SELECT ON TABLE .*"public"\."delta_verifications".* TO "ofertasuper_verifier";/);
  assert.match(sql, /admit_promotion_ready_envelopes\(jsonb\)[\s\S]*TO "ofertasuper_verifier"/);
  assert.match(sql, /admit_promotion_ready_envelopes\(jsonb\)[\s\S]*FROM PUBLIC, "ofertasuper_app", "ofertasuper_runtime"/);
  assert.doesNotMatch(requiredVerifierSql, /INSERT|UPDATE|DELETE|TRUNCATE/);
});

test("verifier principal compose bootstrap provides historical migration-role prerequisites", () => {
  const compose = readFileSync("compose.yml", "utf8");
  const grants = readFileSync("docker/compose/app-grants.sql", "utf8");
  const roleInit = readFileSync("docker/compose/init-app-role.sh", "utf8");
  assert.match(compose, /role-provision:[\s\S]*init-app-role\.sh/);
  assert.match(compose, /migrate:[\s\S]*role-provision: \{ condition: service_completed_successfully \}/);
  assert.match(roleInit, /--set=app_user=ofertasuper_app/);
  assert.match(roleInit, /SELECT format\('CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT', :'app_user', :'app_password'\)/);
  assert.match(roleInit, /WHERE NOT EXISTS \(SELECT FROM pg_roles WHERE rolname = :'app_user'\)\n\\gexec/);
  assert.doesNotMatch(roleInit, /DO \$\$[^]*:'app_user'/);
  assert.match(roleInit, /DO \$\$ BEGIN IF NOT EXISTS \(SELECT FROM pg_roles WHERE rolname = 'ofertasuper_runtime'\) THEN CREATE ROLE ofertasuper_runtime NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; END IF; END \$\$;/);
  for (const role of ["ofertasuper_runtime", "ofertasuper_verifier", "ofertasuper_verifier_definer", "ofertasuper_authority"]) {
    assert.match(roleInit, new RegExp(`DO \\$\\$ BEGIN IF NOT EXISTS \\(SELECT FROM pg_roles WHERE rolname = '${role}'\\) THEN CREATE ROLE ${role} NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; END IF; END \\$\\$;`));
  }
  assert.doesNotMatch(roleInit, /(?:echo|printf)[^\n]*\$APP_PASSWORD/i);
  assert.match(grants, /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.products, public\.supermarkets, public\.supermarket_products/);
  assert.doesNotMatch(grants, /GRANT[^\n]* TO ofertasuper_(?:runtime|verifier|verifier_definer)\b|governed_catalog|serving_|promotion_ready/i);
  assert.doesNotMatch(grants, /CREATE (?:TABLE|FUNCTION|PROCEDURE)/i);
});

test("rejects verifier aliases and documents session_user as the only caller provenance", () => {
  assert.throws(() => renderBootstrapSql({ ...names, verifier: names.app }), /must differ/);
  assert.match(requiredVerifierSql, /session_user/);
  assert.match(requiredVerifierSql, /current_user.*definer.*not caller provenance/i);
});
