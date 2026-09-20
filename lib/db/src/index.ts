import { config } from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import postgres from "postgres";
import { PGlite } from "@electric-sql/pglite";
import * as schema from "./schema";
import { autoInitPglite } from "./auto-seed";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "../../../.env") });

const dbUrl = process.env.DATABASE_URL || "";
const isPgUrl = dbUrl.startsWith("postgresql://") || dbUrl.startsWith("postgres://");

function initDb() {
  if (isPgUrl) {
    const client = postgres(dbUrl);
    return drizzlePg(client, { schema });
  }

  // Fallback: Local persistent embedded PostgreSQL via PGlite
  const pgDir = path.resolve(__dirname, "../.pgdata");
  if (!fs.existsSync(pgDir)) {
    fs.mkdirSync(pgDir, { recursive: true });
  }
  const client = new PGlite(pgDir);
  void autoInitPglite(client);
  return drizzlePglite(client, { schema });
}

export const db = initDb() as unknown as ReturnType<typeof drizzlePg<typeof schema>>;

export * from "./schema";