import { config } from "dotenv";
import path from "node:path";
import mysql from "mysql2/promise";
import bcrypt from "bcrypt";
import { runMigrations } from "./migrate";

// Auto-load .env file
config({ path: path.resolve(import.meta.dirname, "../../../.env") });

async function seed() {
  const databaseUrl =
    process.env.DATABASE_URL || "mysql://root:1234@localhost:3306/medprix";

  console.log(
    `Connecting to database: ${databaseUrl.replace(/:[^:@]+@/, ":****@")}`
  );

  const conn = await mysql.createConnection(databaseUrl);

  // Ensure table schema has required columns before seeding
  await runMigrations(conn);

  const hash = await bcrypt.hash("admin123", 10);
  const cashierHash = await bcrypt.hash("cashier123", 10);
  const frontdeskHash = await bcrypt.hash("frontdesk123", 10);

  // Remove legacy maria and john users if present
  await conn.execute("DELETE FROM users WHERE username IN ('maria', 'john')");

  // Admin user
  await conn.execute(
    "INSERT INTO users (username, password, full_name, contact_number, role, is_active) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE password=VALUES(password), full_name=VALUES(full_name), contact_number=VALUES(contact_number), role=VALUES(role), is_active=VALUES(is_active)",
    ["admin", hash, "Juan Dela Cruz", "09171234567", "admin", true]
  );

  // Cashier user
  await conn.execute(
    "INSERT INTO users (username, password, full_name, contact_number, role, is_active) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE password=VALUES(password), full_name=VALUES(full_name), contact_number=VALUES(contact_number), role=VALUES(role), is_active=VALUES(is_active)",
    ["cashier", cashierHash, "Maria Santos", "09181234567", "cashier", true]
  );

  // Front Desk user
  await conn.execute(
    "INSERT INTO users (username, password, full_name, contact_number, role, is_active) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE password=VALUES(password), full_name=VALUES(full_name), contact_number=VALUES(contact_number), role=VALUES(role), is_active=VALUES(is_active)",
    ["frontdesk", frontdeskHash, "John Cruz", "09191234567", "frontdesk", true]
  );

  console.log(
    "Default users (admin, cashier, frontdesk) seeded in database successfully."
  );
  await conn.end();
}

seed().catch(console.error);
