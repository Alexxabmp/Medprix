import { config } from "dotenv";
import path from "node:path";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema";

config({ path: path.resolve(import.meta.dirname, "../../../.env") });

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const poolConnection = mysql.createPool(process.env.DATABASE_URL);
export const db = drizzle(poolConnection, { schema, mode: "default" });

export * from "./schema";
