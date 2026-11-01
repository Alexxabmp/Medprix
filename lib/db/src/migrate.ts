import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrationMain } from "./migration-runner";
export { runMigrations, migrationFiles, localMigrationUrl } from "./migration-runner";

// Explicit operator command only. Importing this file never opens a connection.
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  await migrationMain();
}
