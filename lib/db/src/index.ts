import { config } from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import postgres from "postgres";
import { PGlite } from "@electric-sql/pglite";
import * as schema from "./schema/index";
import { assertSchemaReady } from "./readiness";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
if (process.env.MEDPRIX_IGNORE_DOTENV !== "1") config({ path: path.resolve(__dirname, "../../../.env"), quiet: true });

const dbUrl = process.env.DATABASE_URL || "";
const isPgUrl = dbUrl.startsWith("postgresql://") || dbUrl.startsWith("postgres://");

export let rawClient: PGlite | postgres.Sql | null = null;
export let initPromise: Promise<void> | null = null;

function initDb() {
  if (isPgUrl) {
    const client = postgres(dbUrl, { prepare: false });
    rawClient = client;
    initPromise = assertSchemaReady(async (text, params = []) => ({ rows: await client.unsafe(text, params) })).then(() => {});
    void initPromise.catch(() => {});
    return drizzlePg(client, { schema });
  }

  // Embedded mode requires an explicitly chosen, already initialized database.
  // Never silently replace a missing/broken persistent DB with empty memory storage.
  const pgDir = process.env.PGLITE_DATA_DIR;
  if (dbUrl || !pgDir || !fs.existsSync(pgDir))
    throw new Error("Configure DATABASE_URL or an existing PGLITE_DATA_DIR. Database startup never creates or seeds application schema.");
  const client = new PGlite(pgDir);
  rawClient = client;
  initPromise = assertSchemaReady((text, params = []) => client.query(text, params)).then(() => {});
  void initPromise.catch(() => {});
  return drizzlePglite(client, { schema });
}

export async function queryDb<T = any>(queryText: string, params: any[] = []): Promise<{ rows: T[] }> {
  if (initPromise) {
    await initPromise;
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
    await initPromise;
  }
  if (isPgUrl && rawClient) {
    await (rawClient as any).unsafe(sqlText);
    return;
  }
  if (rawClient && "exec" in rawClient) {
    await (rawClient as PGlite).exec(sqlText);
  }
}

export type TransactionQuery = (text: string, params?: any[]) => Promise<{ rows: any[] }>;

/** Run every statement on one connection; never issue pooled BEGIN/COMMIT calls. */
export async function withTransaction<T>(work: (query: TransactionQuery) => Promise<T>): Promise<T> {
  if (initPromise) await initPromise;
  if (isPgUrl && rawClient) {
    return (rawClient as postgres.Sql).begin(async (client) =>
      work(async (text, params = []) => ({ rows: await client.unsafe(text, params) })),
    ) as Promise<T>;
  }
  if (rawClient && "transaction" in rawClient) {
    return (rawClient as PGlite).transaction((client) =>
      work(async (text, params = []) => client.query(text, params)),
    );
  }
  throw new Error("Database transaction is unavailable.");
}

export const db = initDb() as unknown as ReturnType<typeof drizzlePg<typeof schema>>;

export * from "./schema/index";
