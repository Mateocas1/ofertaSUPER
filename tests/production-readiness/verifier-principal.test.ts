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

test("keeps compose bootstrap aligned with the verifier ACL and creates no admission object", () => {
  const grants = readFileSync("docker/compose/app-grants.sql", "utf8");
  const roleInit = readFileSync("docker/compose/init-app-role.sh", "utf8");
  assert.match(roleInit, /--set=app_user=ofertasuper_app/);
  assert.match(roleInit, /SELECT format\('CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT', :'app_user', :'app_password'\)/);
  assert.match(roleInit, /WHERE NOT EXISTS \(SELECT FROM pg_roles WHERE rolname = :'app_user'\)\n\\gexec/);
  assert.doesNotMatch(roleInit, /DO \$\$[^]*:'app_user'/);
  assert.match(roleInit, /DO \$\$ BEGIN IF NOT EXISTS \(SELECT FROM pg_roles WHERE rolname = 'ofertasuper_runtime'\) THEN CREATE ROLE ofertasuper_runtime NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; END IF; END \$\$;/);
  assert.match(roleInit, /DO \$\$ BEGIN IF NOT EXISTS \(SELECT FROM pg_roles WHERE rolname = 'ofertasuper_verifier'\) THEN CREATE ROLE ofertasuper_verifier LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; END IF; END \$\$;/);
  assert.match(grants, /DO \$\$ BEGIN IF NOT EXISTS \(SELECT FROM pg_roles WHERE rolname = 'ofertasuper_verifier'\) THEN CREATE ROLE ofertasuper_verifier LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; END IF; END \$\$;/);
  assert.match(grants, /GRANT EXECUTE ON FUNCTION public\.capture_source_delta\(text, text, jsonb\) TO ofertasuper_app/);
  assert.match(grants, /REVOKE EXECUTE ON FUNCTION public\.activate_authority\(jsonb\), public\.inspect_authority\(text, text, text\), public\.revoke_authority\(jsonb\) FROM PUBLIC, ofertasuper_app/);
  assert.match(grants, /TO ofertasuper_authority/);
  assert.match(grants, /capture_source_delta\(text, text, jsonb\) SECURITY DEFINER;/);
  for (const statement of requiredVerifierSql.trim().split("\n")) assert.ok(grants.includes(statement), `missing compose grant: ${statement}`);
  assert.doesNotMatch(grants, /CREATE (?:TABLE|FUNCTION|PROCEDURE).*promotion_ready/i);
});

test("rejects verifier aliases and documents session_user as the only caller provenance", () => {
  assert.throws(() => renderBootstrapSql({ ...names, verifier: names.app }), /must differ/);
  assert.match(requiredVerifierSql, /session_user/);
  assert.match(requiredVerifierSql, /current_user.*definer.*not caller provenance/i);
});
