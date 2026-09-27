import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

import { readCommandResult } from "./compose-command-result.mjs";

const compose = ["compose", "--project-name", "ofertasuper-compose-smoke", "--file", "compose.yml"];

// Tables that the grants stage exposes to ofertasuper_app (docker/compose/app-grants.sql),
// spanning the initial migration through the direct-refresh run ledger.
const BOUNDARY_TABLES = [
  "products",
  "supermarkets",
  "supermarket_products",
  "price_history",
  "promotions",
  "promotion_products",
  "categories",
  "ingestion_run",
  "staging_product",
  "source_health",
  "direct_refresh_run_ledger",
];

function docker(args, capture = false) {
  const result = spawnSync("docker", [...compose, ...args], { encoding: "utf8", stdio: capture ? "pipe" : "inherit" });
  return readCommandResult(result, `docker ${args.join(" ")}`);
}
function psql(query) {
  return docker(["exec", "-T", "postgres", "psql", "-U", "ofertasuper_owner", "-d", "ofertasuper", "-Atc", query], true);
}

for (const variable of ["POSTGRES_PASSWORD", "APP_PASSWORD"]) {
  if (!process.env[variable]) {
    throw new Error(`compose smoke requires ${variable} in the environment; compose.yml interpolates it from a gitignored project .env and the value is never printed`);
  }
}

try {
  // Same chain as `bootstrap:cmvp-local`: build and run role-provision -> migrate -> grants -> seed.
  docker(["up", "--build", "--exit-code-from", "seed", "seed"]);
  // --exit-code-from implies --abort-on-container-exit, so start postgres again against the
  // smoke project's own volume to inspect what the bootstrap chain produced.
  docker(["up", "--detach", "--wait", "postgres"]);

  const tableList = BOUNDARY_TABLES.map((table) => `'${table}'`).join(", ");
  const tables = psql(`SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name IN (${tableList})`);
  assert.equal(tables, String(BOUNDARY_TABLES.length), "migrations did not create the full app boundary table set");

  const grantCells = BOUNDARY_TABLES.flatMap((table) => ["SELECT", "INSERT", "UPDATE", "DELETE"].map((privilege) => `('${table}', '${privilege}')`)).join(", ");
  const grants = psql(`SELECT count(*) FROM (VALUES ${grantCells}) AS t(tbl, privilege) WHERE has_table_privilege('ofertasuper_app', 'public.' || tbl, privilege)`);
  assert.equal(grants, String(BOUNDARY_TABLES.length * 4), "ofertasuper_app did not receive its full table grants");

  const stores = psql("SELECT count(*) || ':' || string_agg(slug || '=' || name, ',' ORDER BY slug) FROM supermarkets");
  assert.equal(stores, "3:carrefour=Carrefour,disco=Disco,jumbo=Jumbo");

  console.log("Compose smoke passed: bootstrap chain, migration tables, ofertasuper_app grants, and seed stores verified.");
} finally {
  docker(["down", "--volumes", "--remove-orphans"]);
}
