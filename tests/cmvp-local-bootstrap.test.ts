import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const compose = readFileSync(new URL("../compose.yml", import.meta.url), "utf8");
const dockerfile = readFileSync(new URL("../Dockerfile", import.meta.url), "utf8");
const initializer = readFileSync(new URL("../docker/compose/init-app-role.sh", import.meta.url), "utf8");
const grants = readFileSync(new URL("../docker/compose/app-grants.sql", import.meta.url), "utf8");
const fixture = readFileSync(new URL("../docker/compose/fixture.sql", import.meta.url), "utf8");
const seed = readFileSync(new URL("../prisma/seed.ts", import.meta.url), "utf8");
const packageJson = readFileSync(new URL("../package.json", import.meta.url), "utf8");

test("CMVP local bootstrap provisions roles before migrations on fresh and preserved volumes", () => {
  for (const service of ["postgres", "role-provision", "migrate", "grants", "seed"]) assert.match(compose, new RegExp(`^  ${service}:`, "m"));
  assert.doesNotMatch(compose, /^  (?:redis|web|fixture):/m);
  assert.match(compose, /role-provision:[\s\S]*postgres: \{ condition: service_healthy \}/);
  assert.match(compose, /migrate:[\s\S]*role-provision: \{ condition: service_completed_successfully \}/);
  assert.match(compose, /grants:[\s\S]*migrate: \{ condition: service_completed_successfully \}/);
  assert.match(compose, /seed:[\s\S]*grants: \{ condition: service_completed_successfully \}/);
  assert.match(compose, /DATABASE_URL: postgresql:\/\/ofertasuper_app:app-local-only@postgres:5432\/ofertasuper/);
  assert.match(compose, /role-provision:[\s\S]*init-app-role\.sh/);
  assert.match(dockerfile, /FROM dependencies AS seeder\nCOPY prisma \.\/prisma\nRUN npm run db:generate/);
  assert.match(compose, /seed:\n    build: \{ context: \., target: seeder \}/);
  assert.match(packageJson, /"bootstrap:cmvp-local": "docker compose up --build --exit-code-from seed seed"/);
  assert.doesNotMatch(packageJson, /"bootstrap:cmvp-local": "[^"]*--abort-on-container-exit/);
});

test("CMVP local bootstrap seeds only the accepted stores and keeps historical roles out of app serving", () => {
  for (const source of [compose, initializer, grants]) assert.doesNotMatch(source, /AUTHORITY_PASSWORD|governed_catalog|publication/i);
  assert.doesNotMatch(compose, /DATABASE_URL: postgresql:\/\/ofertasuper_(?:runtime|verifier|verifier_definer|authority)@/);
  for (const role of ["ofertasuper_runtime", "ofertasuper_verifier", "ofertasuper_verifier_definer", "ofertasuper_authority"]) assert.match(initializer, new RegExp(`rolname = '${role}'`));
  assert.doesNotMatch(fixture, /compose-market|Compose Smoke Saffron/i);
  for (const store of ["Disco", "Jumbo", "Carrefour"]) assert.match(seed, new RegExp(`name: ["']${store}["']`));
  assert.doesNotMatch(seed, /from ["']\.\.\/src\/lib\/supermarkets["']/);
  assert.equal((seed.match(/prisma\.supermarket\.upsert/g) || []).length, 1);
});

test("CMVP local bootstrap grants the app role only core catalog and ingestion CRUD plus sequence access", () => {
  assert.match(grants, /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.products, public\.supermarkets, public\.supermarket_products, public\.price_history, public\.promotions, public\.promotion_products, public\.categories, public\.ingestion_run, public\.staging_product, public\.source_health, public\.direct_refresh_run_ledger TO ofertasuper_app;/);
  assert.match(grants, /GRANT USAGE, SELECT ON SEQUENCE public\.supermarkets_id_seq, public\.supermarket_products_id_seq, public\.price_history_id_seq, public\.promotions_id_seq, public\.categories_id_seq, public\.ingestion_run_id_seq, public\.staging_product_id_seq, public\.source_health_id_seq TO ofertasuper_app;/);
  assert.doesNotMatch(grants, /CREATE ROLE|ALTER ROLE|ALTER TABLE|ALTER SEQUENCE|ALTER FUNCTION|GRANT CONNECT|GRANT SELECT ON TABLE public\.(?:authority_candidates|governed_catalogs|serving_)/i);
  const authorityFunctions = [
    "create_approval_challenge(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ)",
    "consume_approval_challenge(TEXT)",
    "record_candidate_approval_receipt(TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT)",
    "prepare_authority_revoke_consent(JSONB)",
    "record_authority_revoke_consent(JSONB)",
  ];
  for (const signature of authorityFunctions) {
    const escaped = signature.replace(/[()]/g, "\\$&");
    assert.match(grants, new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.${escaped} FROM PUBLIC, ofertasuper_app, ofertasuper_runtime, ofertasuper_verifier;`));
    assert.match(grants, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${escaped} TO ofertasuper_authority;`));
  }
});
