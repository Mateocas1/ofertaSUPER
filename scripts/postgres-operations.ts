import { spawnSync, type SpawnSyncReturns } from "node:child_process";

export type BootstrapNames = { database: string; owner: string; app: string; schema?: string };
type RuntimeEnv = Readonly<Record<string, string | undefined>>;
export type Runner = (command: string, args: string[], options: { env: RuntimeEnv; stdio: "inherit" }) => SpawnSyncReturns<Buffer>;

const IDENTIFIER = /^[a-z_][a-z0-9_]{0,62}$/;

function identifier(value: string, label: string): string {
  if (!IDENTIFIER.test(value)) throw new Error(`${label} must match ${IDENTIFIER.source}`);
  return `"${value}"`;
}

export function renderBootstrapSql(names: BootstrapNames): string {
  const database = identifier(names.database, "database");
  const owner = identifier(names.owner, "owner");
  const app = identifier(names.app, "app");
  const schema = identifier(names.schema ?? "public", "schema");
  if (names.owner === names.app) throw new Error("owner and app roles must differ");

  return [
    "-- Roles and database must already exist; this script never handles credentials.",
    `GRANT CONNECT ON DATABASE ${database} TO ${app};`,
    `REVOKE CREATE ON SCHEMA ${schema} FROM ${app};`,
    `GRANT USAGE ON SCHEMA ${schema} TO ${app};`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${schema} TO ${app};`,
    `GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA ${schema} TO ${app};`,
    `ALTER DEFAULT PRIVILEGES FOR ROLE ${owner} IN SCHEMA ${schema} GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${app};`,
    `ALTER DEFAULT PRIVILEGES FOR ROLE ${owner} IN SCHEMA ${schema} GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO ${app};`,
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
