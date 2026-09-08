import { config } from "dotenv";
import path from "node:path";
import { defineConfig } from "drizzle-kit";

config({ path: path.resolve(import.meta.dirname, "../../../.env") });

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export default defineConfig({
  dialect: "mysql",
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
