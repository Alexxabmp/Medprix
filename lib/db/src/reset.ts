/**
 * Wipes the app's database objects so `drizzle-kit push` can rebuild everything from the Drizzle schema.
 *
 *   npm run reset --workspace=@workspace/db -- --yes
 *
 * Drops every table and enum type in the `public` schema plus the updated_at trigger function.
 * Other schemas (auth, storage, extensions …) and Supabase's role grants are left untouched.
 * DESTRUCTIVE — only for mock/dev.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import postgres from "postgres";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ quiet: true });
dotenv.config({ path: path.resolve(__dirname, "../../../.env"), quiet: true });

const args = new Set(process.argv.slice(2));
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
if (!args.has("--yes")) {
    console.error("This DROPS every table and enum in the public schema. Re-run with --yes to confirm.");
    process.exit(1);
}
if (process.env.NODE_ENV === "production" && !args.has("--allow-production"))
    throw new Error("Refusing to reset with NODE_ENV=production (pass --allow-production if you really mean it)");

const sql = postgres(url, {
    max: 1,
    ssl: /@(localhost|127\.0\.0\.1)[:/]/.test(url) ? false : "require",
    prepare: !/:6543\b/.test(url),
    onnotice: () => { },
});

try {
    const target = new URL(url);
    console.log(`Resetting public schema on ${target.hostname}${target.pathname} …`);
    const [counts] = await sql<{ tables: number; types: number }[]>`
    select
      (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'p')) as tables,
      (select count(*)::int from pg_type t join pg_namespace n on n.oid = t.typnamespace
        where n.nspname = 'public' and t.typtype = 'e') as types`;
    await sql.unsafe(`
    DO $$
    DECLARE r record;
    BEGIN
      FOR r IN
        SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
          AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e')
      LOOP
        EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', r.relname);
      END LOOP;
      FOR r IN
        SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public' AND t.typtype = 'e'
      LOOP
        EXECUTE format('DROP TYPE IF EXISTS public.%I CASCADE', r.typname);
      END LOOP;
      DROP FUNCTION IF EXISTS public.update_updated_at_column() CASCADE;
    END $$;`);
    console.log(`Dropped ${counts?.tables ?? 0} table(s) and ${counts?.types ?? 0} enum type(s).`);
} finally {
    await sql.end();
}