import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

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

export async function runMigrations(existingSql?: postgres.Sql) {
  const databaseUrl =
    process.env.DATABASE_URL ||
    "postgresql://postgres:postgres@localhost:5432/medprix";

  const sql = existingSql || postgres(databaseUrl);
  const shouldClose = !existingSql;

  try {
    console.log("Running database migrations for PostgreSQL...");

    // Check if 'users' table exists
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'users'
    `;

    if (tables.length === 0) {
      console.log("'users' table does not exist yet. Skipping column migrations.");
      return;
    }

    // Fetch current columns
    const columns = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'users'
    `;
    const colList = columns.map((c) => c.column_name);

    // Migrate 'fullName' -> 'full_name' if needed
    if (colList.includes("fullName") && !colList.includes("full_name")) {
      console.log("Migrating column: fullName -> full_name...");
      await sql`ALTER TABLE users RENAME COLUMN "fullName" TO full_name`;
    }

    // Migrate 'contactNumber' -> 'contact_number' if needed
    if (colList.includes("contactNumber") && !colList.includes("contact_number")) {
      console.log("Migrating column: contactNumber -> contact_number...");
      await sql`ALTER TABLE users RENAME COLUMN "contactNumber" TO contact_number`;
    }

    // Migrate 'lastLogin' -> 'last_login' if needed
    if (colList.includes("lastLogin") && !colList.includes("last_login")) {
      console.log("Migrating column: lastLogin -> last_login...");
      await sql`ALTER TABLE users RENAME COLUMN "lastLogin" TO last_login`;
    }

    // Add 'is_active' column if missing
    if (!colList.includes("is_active")) {
      console.log("Adding missing column: is_active (default true)...");
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true`;
    }

    console.log("Database migrations completed successfully.");
  } finally {
    if (shouldClose) {
      await sql.end();
    }
  }
}

// Allow direct CLI execution
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(__filename)
) {
  runMigrations().catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
}
