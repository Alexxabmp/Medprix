/**
 * Re-creates the DB-side `updated_at` triggers (Drizzle can't manage triggers, so they are not part of
 * `drizzle-kit push`). Safe to run any number of times; it covers every public table that has an
 * `updated_at` column, so new tables are picked up automatically.
 *
 *   npm run triggers --workspace=@workspace/db
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import postgres from "postgres";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ quiet: true });
dotenv.config({ path: path.resolve(__dirname, "../../../.env"), quiet: true });

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const sql = postgres(url, {
    max: 1,
    ssl: /@(localhost|127\.0\.0\.1)[:/]/.test(url) ? false : "require",
    prepare: !/:6543\b/.test(url),
    onnotice: () => { },
});

try {
    await sql.unsafe(`
    CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS trigger AS $fn$
    BEGIN
      NEW.updated_at = CURRENT_TIMESTAMP;
      RETURN NEW;
    END;
    $fn$ LANGUAGE plpgsql;`);
    const tables = await sql<{ table_name: string }[]>`
    select c.table_name from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public' and c.column_name = 'updated_at' and t.table_type = 'BASE TABLE'
    order by 1`;
    for (const { table_name: t } of tables) {
        await sql.unsafe(`DROP TRIGGER IF EXISTS "trg_${t}_updated_at" ON public."${t}"`);
        await sql.unsafe(
            `CREATE TRIGGER "trg_${t}_updated_at" BEFORE UPDATE ON public."${t}" FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()`,
        );
    }
    console.log(`updated_at triggers installed on ${tables.length} tables: ${tables.map((t) => t.table_name).join(", ")}`);
} finally {
    await sql.end();
}