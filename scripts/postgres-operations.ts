import { spawnSync, type SpawnSyncReturns } from "node:child_process";

export type BootstrapNames = { database: string; owner: string; app: string; runtime?: string; verifier?: string; verifierDefiner?: string; schema?: string };
type RuntimeEnv = Readonly<Record<string, string | undefined>>;
export type Runner = (command: string, args: string[], options: { env: RuntimeEnv; stdio: "inherit" }) => SpawnSyncReturns<Buffer>;

const IDENTIFIER = /^[a-z_][a-z0-9_]{0,62}$/;

function identifier(value: string, label: string): string {
  if (!IDENTIFIER.test(value)) throw new Error(`${label} must match ${IDENTIFIER.source}`);
  return `"${value}"`;
}

const SOURCE_TABLES = ["products", "supermarkets", "supermarket_products", "price_history", "promotions", "promotion_products", "categories", "ingestion_run", "staging_product", "source_health", "direct_refresh_run_ledger"];
const SOURCE_SEQUENCES = ["supermarkets_id_seq", "supermarket_products_id_seq", "price_history_id_seq", "promotions_id_seq", "categories_id_seq", "ingestion_run_id_seq", "staging_product_id_seq", "source_health_id_seq"];
const PROTECTED_TABLES = ["governed_catalogs", "catalog_operations", "serving_products", "serving_supermarkets", "serving_offers", "serving_history", "serving_promotions", "serving_memberships", "production_readiness_promotions", "production_readiness_receipts", "production_readiness_publications"];
const VERIFIER_EVIDENCE_TABLES = ["source_capture_operations", "source_capture_items", "delta_verifications", "evidence_artifacts", "evidence_references", "evidence_dependencies", "evidence_restrictions"];

function qualifiedObjects(schema: string, names: string[]): string {
  return names.map((name) => `${schema}."${name}"`).join(", ");
}

function bootstrapContext(names: BootstrapNames) {
  const raw = { owner: names.owner, app: names.app, runtime: names.runtime ?? "ofertasuper_runtime", verifier: names.verifier ?? "ofertasuper_verifier", verifierDefiner: names.verifierDefiner ?? "ofertasuper_verifier_definer" };
  if (new Set(Object.values(raw)).size !== 5) throw new Error("owner, app, runtime, verifier, and verifier definer roles must differ");
  const schema = identifier(names.schema ?? "public", "schema");
  return { database: identifier(names.database, "database"), schema, ...Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, identifier(value, key)])) as Record<keyof typeof raw, string> };
}

export function renderVerifierAclSql(names: BootstrapNames): string {
  const { database, schema, owner, app, runtime, verifier, verifierDefiner } = bootstrapContext(names);
  const admission = `${schema}."admit_promotion_ready_envelopes"(jsonb)`;
  const commitment = `${schema}."commit_promotion_ready_envelope"(bytea, text)`;
  return [
    `ALTER ROLE ${verifier} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;`,
    `ALTER ROLE ${verifierDefiner} NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;`,
    `GRANT CONNECT ON DATABASE ${database} TO ${verifier};`,
    `REVOKE ${owner} FROM ${verifier};`,
    `REVOKE ${verifier} FROM ${app}, ${runtime};`,
    `REVOKE ${app}, ${runtime} FROM ${verifier};`,
    `REVOKE CREATE ON SCHEMA ${schema} FROM ${verifier};`,
    `REVOKE ALL ON ALL TABLES IN SCHEMA ${schema} FROM ${verifier};`,
    `REVOKE ALL ON ALL SEQUENCES IN SCHEMA ${schema} FROM ${verifier};`,
    `REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA ${schema} FROM ${verifier};`,
    `GRANT USAGE ON SCHEMA ${schema} TO ${verifier};`,
    `GRANT SELECT ON TABLE ${qualifiedObjects(schema, [...SOURCE_TABLES, ...PROTECTED_TABLES, ...VERIFIER_EVIDENCE_TABLES])} TO ${verifier};`,
    `-- ${commitment} and future ${admission} use session_user as caller provenance; current_user is the definer and not caller provenance.`,
    `DO $verifier_acl$ DECLARE target regprocedure; BEGIN FOREACH target IN ARRAY ARRAY[pg_catalog.to_regprocedure('${names.schema ?? "public"}.commit_promotion_ready_envelope(bytea,text)'), pg_catalog.to_regprocedure('${names.schema ?? "public"}.admit_promotion_ready_envelopes(jsonb)')] LOOP IF target IS NOT NULL THEN IF NOT (SELECT p.prosecdef AND p.proconfig = ARRAY['search_path=pg_catalog, pg_temp'] FROM pg_catalog.pg_proc p WHERE p.oid = target) THEN RAISE EXCEPTION 'unsafe verifier boundary'; END IF; EXECUTE pg_catalog.format('ALTER FUNCTION %s OWNER TO ${verifierDefiner}', target); EXECUTE pg_catalog.format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, ${app}, ${runtime}', target); EXECUTE pg_catalog.format('GRANT EXECUTE ON FUNCTION %s TO ${verifier}', target); END IF; END LOOP; IF pg_catalog.to_regprocedure('${names.schema ?? "public"}.canonical_json_text(jsonb)') IS NOT NULL THEN EXECUTE 'ALTER FUNCTION ${schema}."canonical_json_text"(jsonb) OWNER TO ${verifierDefiner}'; EXECUTE 'REVOKE EXECUTE ON FUNCTION ${schema}."canonical_json_text"(jsonb) FROM PUBLIC, ${app}, ${runtime}, ${verifier}'; END IF; IF pg_catalog.to_regprocedure('${names.schema ?? "public"}.envelope_items_ordered(jsonb)') IS NOT NULL THEN EXECUTE 'ALTER FUNCTION ${schema}."envelope_items_ordered"(jsonb) OWNER TO ${verifierDefiner}'; EXECUTE 'REVOKE EXECUTE ON FUNCTION ${schema}."envelope_items_ordered"(jsonb) FROM PUBLIC, ${app}, ${runtime}, ${verifier}'; END IF; END $verifier_acl$;`,
  ].join("\n") + "\n";
}

export function renderBootstrapSql(names: BootstrapNames): string {
  const { database, schema, owner, app, runtime, verifierDefiner } = bootstrapContext(names);
  return [
    "-- Roles and database must already exist; this script never handles credentials.",
    `REVOKE ALL ON DATABASE ${database} FROM PUBLIC;`,
    `GRANT CONNECT ON DATABASE ${database} TO ${app}, ${runtime};`,
    `REVOKE ${owner} FROM ${app}, ${runtime};`,
    `ALTER ROLE ${app} NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;`,
    `ALTER ROLE ${runtime} NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;`,
    `REVOKE CREATE ON SCHEMA ${schema} FROM PUBLIC, ${app}, ${runtime};`,
    `REVOKE ALL ON ALL TABLES IN SCHEMA ${schema} FROM PUBLIC, ${app}, ${runtime};`,
    `REVOKE ALL ON ALL SEQUENCES IN SCHEMA ${schema} FROM PUBLIC, ${app}, ${runtime};`,
    `REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA ${schema} FROM PUBLIC, ${app}, ${runtime};`,
    `GRANT USAGE ON SCHEMA ${schema} TO ${app}, ${runtime};`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ${qualifiedObjects(schema, SOURCE_TABLES)} TO ${app};`,
    ...[...SOURCE_TABLES, ...PROTECTED_TABLES].map((name) => `ALTER TABLE ${schema}."${name}" OWNER TO ${owner};`),
    ...["verifier_envelope_commitments", "promotion_ready_envelope_admissions", "promotion_ready_envelope_items"].map((name) => `ALTER TABLE ${schema}."${name}" OWNER TO ${verifierDefiner};`),
    ...SOURCE_SEQUENCES.map((name) => `ALTER SEQUENCE ${schema}."${name}" OWNER TO ${owner};`),
    `GRANT USAGE, SELECT ON SEQUENCE ${qualifiedObjects(schema, SOURCE_SEQUENCES)} TO ${app};`,
    `ALTER FUNCTION ${schema}."guard_governed_catalog_mutation"() OWNER TO ${owner};`,
    `REVOKE EXECUTE ON FUNCTION ${schema}."governed_catalog_begin_baseline"(text, text, text, bigint) FROM PUBLIC, ${app}, ${runtime};`,
        `ALTER FUNCTION ${schema}."governed_catalog_begin_baseline"(text, text, text, text, bigint, bigint, timestamptz) OWNER TO ${owner};`,
    `ALTER FUNCTION ${schema}."governed_catalog_begin_baseline"(text, text, text, text, bigint, bigint, timestamptz) SECURITY DEFINER;`,
    `ALTER FUNCTION ${schema}."governed_catalog_begin_baseline"(text, text, text, text, bigint, bigint, timestamptz) SET search_path = pg_catalog, pg_temp;`,
    `GRANT EXECUTE ON FUNCTION ${schema}."governed_catalog_begin_baseline"(text, text, text, text, bigint, bigint, timestamptz) TO ${app};`,
    `GRANT SELECT ON TABLE ${qualifiedObjects(schema, ["governed_catalogs", "serving_products", "serving_supermarkets", "serving_offers", "serving_history", "serving_promotions", "serving_memberships"])} TO ${runtime};`,
    `ALTER DEFAULT PRIVILEGES FOR ROLE ${owner} REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;`,
    `ALTER DEFAULT PRIVILEGES FOR ROLE ${owner} IN SCHEMA ${schema} REVOKE ALL ON TABLES FROM PUBLIC, ${app};`,
    `ALTER DEFAULT PRIVILEGES FOR ROLE ${owner} IN SCHEMA ${schema} REVOKE ALL ON SEQUENCES FROM PUBLIC, ${app};`,
    `ALTER DEFAULT PRIVILEGES FOR ROLE ${owner} IN SCHEMA ${schema} REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, ${app};`,
    `-- Protected tables remain denied: ${PROTECTED_TABLES.join(", ")}.`,
    renderVerifierAclSql(names).trimEnd(),
  ].join("\n") + "\n";
}

export function migrationInvocation(env: RuntimeEnv) {
  if (!env.DIRECT_URL) throw new Error("DIRECT_URL is required for migrations");
  let protocol: string;
  try {
    protocol = new URL(env.DIRECT_URL).protocol;
  } catch {
    throw new Error("DIRECT_URL must be a valid PostgreSQL URL");
  }
  if (protocol !== "postgresql:" && protocol !== "postgres:") {
    throw new Error("DIRECT_URL must be a valid PostgreSQL URL");
  }
  return {
    command: process.platform === "win32" ? "npx.cmd" : "npx",
    args: ["prisma", "migrate", "deploy"],
    env: { ...env, DATABASE_URL: env.DIRECT_URL },
  };
}

export function deployMigrations(env: RuntimeEnv = process.env, runner: Runner = spawnSync): number {
  const invocation = migrationInvocation(env);
  const result = runner(invocation.command, invocation.args, { env: invocation.env, stdio: "inherit" });
  if (result.error) throw result.error;
  return result.status ?? 1;
}
