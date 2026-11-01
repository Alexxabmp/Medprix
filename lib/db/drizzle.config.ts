import { defineConfig } from "drizzle-kit";
import { databaseUrl, loadDatabaseEnvironment } from "./src/database-environment";

loadDatabaseEnvironment();
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dbCredentials: { url: databaseUrl(process.env.DATABASE_URL) },
  migrations: { schema: "drizzle", table: "__drizzle_migrations" },
});
