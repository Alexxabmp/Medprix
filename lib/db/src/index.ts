import dns from "node:dns";
import net from "node:net";
if (typeof dns.setDefaultResultOrder === "function") {
  dns.setDefaultResultOrder("ipv4first");
}
if (typeof net.setDefaultAutoSelectFamily === "function") {
  net.setDefaultAutoSelectFamily(false);
}

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
if (process.env.MEDPRIX_IGNORE_DOTENV !== "1") {
  const envCandidates = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(__dirname, "../../../.env"),
  ];
  for (const envPath of envCandidates) {
    if (fs.existsSync(envPath)) {
      config({ path: envPath, quiet: true });
      break;
    }
  }
}

function findLocalPgDir(): string | null {
  const candidates = [
    process.env.PGLITE_DATA_DIR,
    path.resolve(process.cwd(), "lib/db/.pgdata-local"),
    path.resolve(__dirname, "../../../lib/db/.pgdata-local"),
    path.resolve(__dirname, "../.pgdata-local"),
  ].filter((c): c is string => Boolean(c));
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  return null;
}

const dbUrl = process.env.DATABASE_URL || "";
const isPgUrl = dbUrl.startsWith("postgresql://") || dbUrl.startsWith("postgres://");

export let rawClient: PGlite | postgres.Sql | null = null;
export let initPromise: Promise<void> | null = null;

type DrizzleInstance = ReturnType<typeof drizzlePg<typeof schema>>;
let activeDrizzle: DrizzleInstance | null = null;
let activeMode: "pg" | "pglite" = isPgUrl ? "pg" : "pglite";

let readinessVerified = false;
let currentCheck: Promise<void> | null = null;
let checkFn: (() => Promise<void>) | null = null;

function isNetworkError(err: any): boolean {
  const code = String(err?.code || err?.errno || "");
  const msg = String(err?.message || "");
  return (
    code === "ENOTFOUND" ||
    code === "EAI_AGAIN" ||
    code === "ETIMEDOUT" ||
    code === "ECONNRESET" ||
    code === "ECONNREFUSED" ||
    code === "CONNECT_TIMEOUT" ||
    msg.includes("CONNECT_TIMEOUT") ||
    msg.includes("ETIMEDOUT") ||
    msg.includes("ENOTFOUND")
  );
}

async function activatePgliteFallback(): Promise<boolean> {
  const fallbackDir = findLocalPgDir();
  if (!fallbackDir) return false;
  if (activeMode === "pglite" && rawClient && "query" in rawClient && readinessVerified) {
    return true;
  }
  const pgliteClient = new PGlite(fallbackDir);
  await assertSchemaReady((text, params = []) => pgliteClient.query(text, params));
  rawClient = pgliteClient;
  activeMode = "pglite";
  activeDrizzle = drizzlePglite(pgliteClient, { schema }) as unknown as DrizzleInstance;
  checkFn = () => assertSchemaReady((text, params = []) => pgliteClient.query(text, params)).then(() => {});
  readinessVerified = true;
  console.log(`[DB] Switched to local embedded database (${fallbackDir})`);
  return true;
}

export async function ensureDbReady(): Promise<void> {
  if (readinessVerified) return;
  if (!checkFn) {
    if (initPromise) await initPromise;
    return;
  }
  if (!currentCheck) {
    currentCheck = (async () => {
      try {
        await checkFn!();
        readinessVerified = true;
        return;
      } catch (err: any) {
        if (isPgUrl && (isNetworkError(err) || err?.name === "SchemaReadinessError")) {
          try {
            const switched = await activatePgliteFallback();
            if (switched) return;
          } catch (fallbackErr) {
            console.error("[DB] Local fallback failed:", fallbackErr);
          }
        }
        currentCheck = null;
        throw err;
      }
    })();
    initPromise = currentCheck;
    void currentCheck.catch(() => {});
  }
  return currentCheck;
}

function initDb(): DrizzleInstance {
  const pgDir = findLocalPgDir();
  if (pgDir && (process.env.USE_LOCAL_DB === "1" || !isPgUrl)) {
    const client = new PGlite(pgDir);
    rawClient = client;
    activeMode = "pglite";
    activeDrizzle = drizzlePglite(client, { schema }) as unknown as DrizzleInstance;
    checkFn = () => assertSchemaReady((text, params = []) => client.query(text, params)).then(() => {});
    readinessVerified = true;
    console.log(`[DB] Using local embedded database directly (${pgDir})`);
    return activeDrizzle;
  }

  if (isPgUrl) {
    const client = postgres(dbUrl, { prepare: false, connect_timeout: 3, idle_timeout: 20, max_lifetime: 300, max: 10 });
    rawClient = client;
    activeMode = "pg";
    activeDrizzle = drizzlePg(client, { schema });
    checkFn = () => assertSchemaReady(async (text, params = []) => ({ rows: await client.unsafe(text, params) })).then(() => {});
    void ensureDbReady().catch(() => {});
    return activeDrizzle;
  }

  if (!pgDir) {
    throw new Error("Configure DATABASE_URL or an existing PGLITE_DATA_DIR. Database startup never creates or seeds application schema.");
  }
  const client = new PGlite(pgDir);
  rawClient = client;
  activeMode = "pglite";
  activeDrizzle = drizzlePglite(client, { schema }) as unknown as DrizzleInstance;
  checkFn = () => assertSchemaReady((text, params = []) => client.query(text, params)).then(() => {});
  void ensureDbReady().catch(() => {});
  return activeDrizzle;
}

initDb();

export const db = new Proxy({} as DrizzleInstance, {
  get(_target, prop, receiver) {
    if (!activeDrizzle) {
      throw new Error("Database is not initialized.");
    }
    const value = Reflect.get(activeDrizzle as object, prop, receiver);
    return typeof value === "function" ? value.bind(activeDrizzle) : value;
  },
});

export async function queryDb<T = any>(queryText: string, params: any[] = []): Promise<{ rows: T[] }> {
  await ensureDbReady();
  if (activeMode === "pg" && rawClient) {
    try {
      const res = await (rawClient as any).unsafe(queryText, params);
      return { rows: res };
    } catch (err) {
      if (isNetworkError(err) && (await activatePgliteFallback())) {
        const res = await (rawClient as PGlite).query<T>(queryText, params);
        return res;
      }
      throw err;
    }
  }
  if (rawClient && "query" in rawClient) {
    const res = await (rawClient as PGlite).query<T>(queryText, params);
    return res;
  }
  return { rows: [] };
}

export async function execDb(sqlText: string): Promise<void> {
  await ensureDbReady();
  if (activeMode === "pg" && rawClient) {
    try {
      await (rawClient as any).unsafe(sqlText);
      return;
    } catch (err) {
      if (isNetworkError(err) && (await activatePgliteFallback())) {
        await (rawClient as PGlite).exec(sqlText);
        return;
      }
      throw err;
    }
  }
  if (rawClient && "exec" in rawClient) {
    await (rawClient as PGlite).exec(sqlText);
  }
}

export type TransactionQuery = (text: string, params?: any[]) => Promise<{ rows: any[] }>;

/** Run every statement on one connection; never issue pooled BEGIN/COMMIT calls. */
export async function withTransaction<T>(work: (query: TransactionQuery) => Promise<T>): Promise<T> {
  await ensureDbReady();
  if (activeMode === "pg" && rawClient) {
    try {
      return (await (rawClient as postgres.Sql).begin(async (client) =>
        work(async (text, params = []) => ({ rows: await client.unsafe(text, params) })),
      )) as T;
    } catch (err) {
      if (isNetworkError(err) && (await activatePgliteFallback())) {
        return (rawClient as PGlite).transaction((client) =>
          work(async (text, params = []) => client.query(text, params)),
        );
      }
      throw err;
    }
  }
  if (rawClient && "transaction" in rawClient) {
    return (rawClient as PGlite).transaction((client) =>
      work(async (text, params = []) => client.query(text, params)),
    );
  }
  throw new Error("Database transaction is unavailable.");
}

export * from "./schema/index";
