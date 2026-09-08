import { config } from "dotenv";
import path from "node:path";
import mysql from "mysql2/promise";
import fs from "node:fs";

config({ path: path.resolve(import.meta.dirname, "../../../.env") });

interface ColumnInfo {
  Field: string;
  Type: string;
  Null: string;
  Key: string;
  Default: string | null;
  Extra: string;
}

export async function runMigrations(existingConn?: mysql.Connection) {
  const databaseUrl =
    process.env.DATABASE_URL || "mysql://root:1234@localhost:3306/medprix";

  const conn =
    existingConn || (await mysql.createConnection(databaseUrl));
  const shouldClose = !existingConn;

  try {
    console.log("Running database migrations...");

    // Check if 'users' table exists
    const [tables] = await conn.execute<mysql.RowDataPacket[]>(
      "SHOW TABLES LIKE 'users'"
    );

    if (tables.length === 0) {
      console.log("'users' table does not exist yet. Skipping column migrations.");
      return;
    }

    // Fetch current columns
    const [columns] = await conn.execute<mysql.RowDataPacket[]>(
      "SHOW COLUMNS FROM users"
    );
    const colList = (columns as unknown as ColumnInfo[]).map((c) => c.Field);

    // Migrate 'fullName' -> 'full_name' if needed
    if (colList.includes("fullName") && !colList.includes("full_name")) {
      console.log("Migrating column: fullName -> full_name...");
      await conn.execute(
        "ALTER TABLE users RENAME COLUMN fullName TO full_name"
      );
    }

    // Migrate 'contactNumber' -> 'contact_number' if needed
    if (colList.includes("contactNumber") && !colList.includes("contact_number")) {
      console.log("Migrating column: contactNumber -> contact_number...");
      await conn.execute(
        "ALTER TABLE users RENAME COLUMN contactNumber TO contact_number"
      );
    }

    // Migrate 'lastLogin' -> 'last_login' if needed
    if (colList.includes("lastLogin") && !colList.includes("last_login")) {
      console.log("Migrating column: lastLogin -> last_login...");
      await conn.execute(
        "ALTER TABLE users RENAME COLUMN lastLogin TO last_login"
      );
    }

    // Add 'is_active' column if missing
    if (!colList.includes("is_active")) {
      console.log("Adding missing column: is_active (default true)...");
      await conn.execute(
        "ALTER TABLE users ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1"
      );
    }

    console.log("Database migrations completed successfully.");
  } finally {
    if (shouldClose) {
      await conn.end();
    }
  }
}

// Allow direct CLI execution
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  runMigrations().catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
}