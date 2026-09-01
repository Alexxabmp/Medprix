import mysql from "mysql2/promise";
import bcrypt from "bcrypt";

async function seed() {
  const conn = await mysql.createConnection({
    host: "localhost",
    port: 3306,
    user: "root",
    password: "root",
    database: "medprix",
  });

  const hash = await bcrypt.hash("admin123", 10);
  const cashierHash = await bcrypt.hash("cashier123", 10);
  const frontdeskHash = await bcrypt.hash("frontdesk123", 10);

  // Remove legacy maria and john users
  await conn.execute("DELETE FROM users WHERE username IN ('maria', 'john')");

  // Admin user
  await conn.execute(
    "INSERT INTO users (username, password, fullName, contactNumber, role) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE password=VALUES(password), fullName=VALUES(fullName), role=VALUES(role)",
    ["admin", hash, "Juan Dela Cruz", "09171234567", "admin"]
  );

  // Cashier user
  await conn.execute(
    "INSERT INTO users (username, password, fullName, contactNumber, role) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE password=VALUES(password), fullName=VALUES(fullName), role=VALUES(role)",
    ["cashier", cashierHash, "Maria Santos", "09181234567", "cashier"]
  );

  // Front Desk user
  await conn.execute(
    "INSERT INTO users (username, password, fullName, contactNumber, role) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE password=VALUES(password), fullName=VALUES(fullName), role=VALUES(role)",
    ["frontdesk", frontdeskHash, "John Cruz", "09191234567", "frontdesk"]
  );

  console.log("Default users (admin, cashier, frontdesk) seeded in database successfully. 'maria' and 'john' removed.");
  await conn.end();
}

seed().catch(console.error);
