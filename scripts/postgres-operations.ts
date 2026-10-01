import { spawnSync, type SpawnSyncReturns } from "node:child_process";

export type BootstrapNames = { database: string; owner: string; app: string; schema?: string };
type RuntimeEnv = Readonly<Record<string, string | undefined>>;
export type Runner = (command: string, args: string[], options: { env: RuntimeEnv; stdio: "inherit" }) => SpawnSyncReturns<Buffer>;

const IDENTIFIER = /^[a-z_][a-z0-9_]{0,62}$/;

function identifier(value: string, label: string): string {
  if (!IDENTIFIER.test(value)) throw new Error(`${label} must match ${IDENTIFIER.source}`);
  return `"${value}"`;
}

const SOURCE_TABLES = ["products", "supermarkets", "supermarket_products", "price_history", "promotions", "promotion_products", "categories", "ingestion_run", "staging_product", "source_health", "direct_refresh_run_ledger"];
const SOURCE_SEQUENCES = ["supermarkets_id_seq", "supermarket_products_id_seq", "price_history_id_seq", "promotions_id_seq", "categories_id_seq", "ingestion_run_id_seq", "staging_product_id_seq", "source_health_id_seq"];

function qualifiedObjects(schema: string, names: string[]): string {
  return names.map((name) => `${schema}."${name}"`).join(", ");
}

function bootstrapContext(names: BootstrapNames) {
  if (names.owner === names.app) throw new Error("owner and app roles must differ");
  return {
    database: identifier(names.database, "database"),
    schema: identifier(names.schema ?? "public", "schema"),
    owner: identifier(names.owner, "owner"),
    app: identifier(names.app, "app"),
  };
}

export function renderBootstrapSql(names: BootstrapNames): string {
  const { database, schema, owner, app } = bootstrapContext(names);
  return [
    "-- Roles and database must already exist; this script never handles credentials.",
    `REVOKE ALL ON DATABASE ${database} FROM PUBLIC;`,
    `GRANT CONNECT ON DATABASE ${database} TO ${app};`,
    `REVOKE ${owner} FROM ${app};`,
    `ALTER ROLE ${app} NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;`,
    `REVOKE CREATE ON SCHEMA ${schema} FROM PUBLIC, ${app};`,
    `REVOKE ALL ON ALL TABLES IN SCHEMA ${schema} FROM PUBLIC, ${app};`,
    `REVOKE ALL ON ALL SEQUENCES IN SCHEMA ${schema} FROM PUBLIC, ${app};`,
    `REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA ${schema} FROM PUBLIC, ${app};`,
    `GRANT USAGE ON SCHEMA ${schema} TO ${app};`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ${qualifiedObjects(schema, SOURCE_TABLES)} TO ${app};`,
    ...SOURCE_TABLES.map((name) => `ALTER TABLE ${schema}."${name}" OWNER TO ${owner};`),
    ...SOURCE_SEQUENCES.map((name) => `ALTER SEQUENCE ${schema}."${name}" OWNER TO ${owner};`),
    `GRANT USAGE, SELECT ON SEQUENCE ${qualifiedObjects(schema, SOURCE_SEQUENCES)} TO ${app};`,
    `ALTER DEFAULT PRIVILEGES FOR ROLE ${owner} REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;`,
    `ALTER DEFAULT PRIVILEGES FOR ROLE ${owner} IN SCHEMA ${schema} REVOKE ALL ON TABLES FROM PUBLIC, ${app};`,
    `ALTER DEFAULT PRIVILEGES FOR ROLE ${owner} IN SCHEMA ${schema} REVOKE ALL ON SEQUENCES FROM PUBLIC, ${app};`,
    `ALTER DEFAULT PRIVILEGES FOR ROLE ${owner} IN SCHEMA ${schema} REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, ${app};`,
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
