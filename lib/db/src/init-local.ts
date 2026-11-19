import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import { PGlite } from "@electric-sql/pglite";
import { assertSchemaReady } from "./readiness";
import { buildData, TABLE_ORDER, T, SEED_PASSWORD } from "./seed";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const LOCAL_PGDATA_DIR = path.resolve(__dirname, "../.pgdata-local");

export async function initLocalPgliteDb(pgDir = LOCAL_PGDATA_DIR) {
  fs.rmSync(pgDir, { recursive: true, force: true });
  const pg = new PGlite(pgDir);
  await pg.exec('CREATE SCHEMA IF NOT EXISTS "drizzle"; CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint);');

  const drizzleDir = path.resolve(__dirname, "../drizzle");
  const journal = JSON.parse(fs.readFileSync(path.join(drizzleDir, "meta/_journal.json"), "utf8"));

  for (const entry of journal.entries) {
    const file = path.join(drizzleDir, entry.tag + ".sql");
    const raw = fs.readFileSync(file, "utf8");
    const hash = crypto.createHash("sha256").update(raw).digest("hex");
    let sql = raw.replace(/--> statement-breakpoint/g, "\n");
    if (entry.tag.startsWith("0004_")) {
      sql = "DROP TABLE IF EXISTS cashier_system_logs, cashier_user_activities CASCADE;";
    } else if (entry.tag.startsWith("0008_")) {
      sql = "DROP TABLE IF EXISTS cashier_transactions, cashier_payment_migrations CASCADE; CREATE SEQUENCE IF NOT EXISTS retail_receipt_number_seq AS BIGINT;";
    }
    await pg.exec(sql);
    await pg.query('INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at) VALUES ($1, $2)', [hash, entry.when]);
  }

  await assertSchemaReady((text, params = []) => pg.query(text, params));
  console.log("Schema readiness verified!");

  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
  buildData(passwordHash);

  for (const table of TABLE_ORDER) {
    const rows = T[table];
    if (!rows || rows.length === 0) continue;
    const cols = Object.keys(rows[0]!);
    const colList = cols.map((c) => `"${c}"`).join(", ");
    const chunkSize = Math.max(1, Math.floor(800 / cols.length));
    for (let i = 0; i < rows.length; i += chunkSize) {
      const slice = rows.slice(i, i + chunkSize);
      const values: unknown[] = [];
      const rowPlaceholders: string[] = [];
      let pIdx = 1;
      for (const r of slice) {
        const ph: string[] = [];
        for (const c of cols) {
          let val = r[c];
          if (val !== null && typeof val === "object" && !(val instanceof Date)) {
            val = JSON.stringify(val);
          }
          values.push(val ?? null);
          ph.push(`$${pIdx++}`);
        }
        rowPlaceholders.push(`(${ph.join(", ")})`);
      }
      await pg.query(`INSERT INTO "${table}" (${colList}) VALUES ${rowPlaceholders.join(", ")}`, values);
    }
    console.log(`Seeded ${table}: ${rows.length} rows`);
  }

  await pg.query(`SELECT setval('wholesale_order_number_seq', $1, true)`, [T.wholesale_orders.length]);
  const { seedWholesaleExamples } = await import(new URL("../../../scripts/seed-wholesale.mjs", import.meta.url).href);
  await pg.transaction(async (tx) => {
    await seedWholesaleExamples({
      unsafe: async (stmt: string, params: unknown[] = []) => (await tx.query(stmt, params)).rows,
    });
  });
  await pg.close();
  console.log("Local PGlite DB initialized and closed cleanly.");
}

initLocalPgliteDb().catch((err) => {
  console.error(err);
  process.exit(1);
});
