import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const compose = readFileSync(new URL("../compose.yml", import.meta.url), "utf8");
const dockerfile = readFileSync(new URL("../Dockerfile", import.meta.url), "utf8");
const initializer = readFileSync(new URL("../docker/compose/init-app-role.sh", import.meta.url), "utf8");
const grants = readFileSync(new URL("../docker/compose/app-grants.sql", import.meta.url), "utf8");
const fixture = readFileSync(new URL("../docker/compose/fixture.sql", import.meta.url), "utf8");
const seed = readFileSync(new URL("../prisma/seed.ts", import.meta.url), "utf8");

test("CMVP local bootstrap provisions roles before migrations on fresh and preserved volumes", () => {
  for (const service of ["postgres", "role-provision", "migrate", "grants", "seed"]) assert.match(compose, new RegExp(`^  ${service}:`, "m"));
  assert.doesNotMatch(compose, /^  (?:redis|web|fixture):/m);
  assert.match(compose, /role-provision:[\s\S]*postgres: \{ condition: service_healthy \}/);
  assert.match(compose, /migrate:[\s\S]*role-provision: \{ condition: service_completed_successfully \}/);
  assert.match(compose, /grants:[\s\S]*migrate: \{ condition: service_completed_successfully \}/);
  assert.match(compose, /seed:[\s\S]*grants: \{ condition: service_completed_successfully \}/);
  assert.match(compose, /DATABASE_URL: postgresql:\/\/ofertasuper_app:\$\{APP_PASSWORD:\?[^}]*\}@postgres:5432\/ofertasuper/);
  assert.match(compose, /role-provision:[\s\S]*init-app-role\.sh/);
  assert.match(dockerfile, /FROM dependencies AS seeder\nCOPY prisma \.\/prisma\nRUN npm run db:generate/);
  assert.match(compose, /seed:\n    build: \{ context: \., target: seeder \}/);
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
  assert.doesNotMatch(grants, /GRANT EXECUTE ON FUNCTION/, "the app role is never granted function execution");
  assert.match(grants, /REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, ofertasuper_app;/);
});

test("CMVP local bootstrap takes credentials from the environment and commits no secret literal", () => {
  assert.doesNotMatch(
    compose,
    /(?:^|(?<![$\w])[{,][ \t]*)(?:POSTGRES_PASSWORD|APP_PASSWORD|PGPASSWORD):[ \t]*(?!\$\{)\S/m,
    "bootstrap passwords must be environment interpolations, not committed literals",
  );
  assert.doesNotMatch(
    compose,
    /postgresql:\/\/[^\s:@/]+:(?!\$\{)[^\s@/]+@/,
    "postgres URLs must not embed a literal password",
  );
  assert.match(compose, /POSTGRES_PASSWORD: \$\{POSTGRES_PASSWORD:\?[^}]*\}/);
  assert.match(compose, /APP_PASSWORD: \$\{APP_PASSWORD:\?[^}]*\}/);
  assert.match(compose, /PGPASSWORD: \$\{POSTGRES_PASSWORD:\?[^}]*\}/);
  assert.match(compose, /DATABASE_URL: postgresql:\/\/ofertasuper_owner:\$\{POSTGRES_PASSWORD:\?[^}]*\}@postgres:5432\/ofertasuper/);
  assert.match(compose, /DIRECT_URL: postgresql:\/\/ofertasuper_owner:\$\{POSTGRES_PASSWORD:\?[^}]*\}@postgres:5432\/ofertasuper/);
  assert.match(compose, /DATABASE_URL: postgresql:\/\/ofertasuper_app:\$\{APP_PASSWORD:\?[^}]*\}@postgres:5432\/ofertasuper/);
});
