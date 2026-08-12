import { deployMigrations } from "./postgres-operations";

try {
  process.exitCode = deployMigrations();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Migration launch failed");
  process.exitCode = 1;
}
