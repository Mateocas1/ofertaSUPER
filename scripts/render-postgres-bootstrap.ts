import { renderBootstrapSql } from "./postgres-operations";

const [database, owner, app, schema] = process.argv.slice(2);
if (!database || !owner || !app) {
  console.error("Usage: npm run db:bootstrap:render -- <database> <owner-role> <app-role> [schema]");
  process.exitCode = 2;
} else {
  try {
    process.stdout.write(renderBootstrapSql({ database, owner, app, schema }));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Invalid bootstrap input");
    process.exitCode = 2;
  }
}
