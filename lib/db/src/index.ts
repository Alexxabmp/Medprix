import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Auto-load .env file if available
try {
  if (typeof process.loadEnvFile === "function") {
    const candidates = [
      path.resolve(process.cwd(), ".env"),
      path.resolve(process.cwd(), "../../.env"),
      path.resolve(__dirname, "../../../.env"),
    ];
    for (const envPath of candidates) {
      if (fs.existsSync(envPath)) {
        process.loadEnvFile(envPath);
        break;
      }
    }
  }
} catch {
  // Ignore if no .env
}

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const poolConnection = mysql.createPool(process.env.DATABASE_URL);
export const db = drizzle(poolConnection, { schema, mode: "default" });

export * from "./schema";
