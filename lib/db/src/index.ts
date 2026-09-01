import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema";

const dbUrl = process.env.DATABASE_URL || "mysql://root:@localhost:3306/medprix";

let dbInstance: ReturnType<typeof drizzle> | null = null;

try {
  const poolConnection = mysql.createPool(dbUrl);
  dbInstance = drizzle(poolConnection, { schema, mode: "default" });
} catch (e) {
  console.warn("MySQL pool initialization warning:", e);
}

export const db = dbInstance!;
export * from "./schema";
