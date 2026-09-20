import { config } from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import postgres from "postgres";
import { PGlite } from "@electric-sql/pglite";
import * as schema from "./schema/index";
import { autoInitPglite } from "./auto-seed";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "../../../.env") });

const dbUrl = process.env.DATABASE_URL || "";
const isPgUrl = dbUrl.startsWith("postgresql://") || dbUrl.startsWith("postgres://");

export let rawClient: PGlite | postgres.Sql | null = null;
export let initPromise: Promise<void> | null = null;

function initDb() {
  if (isPgUrl) {
    const client = postgres(dbUrl);
    rawClient = client;
    return drizzlePg(client, { schema });
  }

  // Fallback: Local persistent embedded PostgreSQL via PGlite
  const pgDir = path.resolve(__dirname, "../.pgdata");
  if (!fs.existsSync(pgDir)) {
    fs.mkdirSync(pgDir, { recursive: true });
  }
  const client = new PGlite(pgDir);
  rawClient = client;
  initPromise = autoInitPglite(client);
  return drizzlePglite(client, { schema });
}

export async function queryDb<T = any>(queryText: string, params: any[] = []): Promise<{ rows: T[] }> {
  if (initPromise) {
    try {
      await initPromise;
    } catch (e) {
      console.warn("DB init notice:", e);
    }
  }
  if (isPgUrl && rawClient) {
    const res = await (rawClient as any).unsafe(queryText, params);
    return { rows: res };
  }
  if (rawClient && "query" in rawClient) {
    const res = await (rawClient as PGlite).query<T>(queryText, params);
    return res;
  }
  return { rows: [] };
}

export async function execDb(sqlText: string): Promise<void> {
  if (initPromise) {
    try {
      await initPromise;
    } catch (e) {
      console.warn("DB init notice:", e);
    }
  }
  if (isPgUrl && rawClient) {
    await (rawClient as any).unsafe(sqlText);
    return;
  }
  if (rawClient && "exec" in rawClient) {
    await (rawClient as PGlite).exec(sqlText);
  }
}

export const db = initDb() as unknown as ReturnType<typeof drizzlePg<typeof schema>>;

export * from "./schema/index";