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

  await conn.execute(
    "INSERT INTO users (username, password, fullName, contactNumber, role) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE fullName=VALUES(fullName)",
    ["admin", hash, "Juan Dela Cruz", "09171234567", "admin"]
  );

  await conn.execute(
    "INSERT INTO users (username, password, fullName, contactNumber, role) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE fullName=VALUES(fullName)",
    ["maria", cashierHash, "Maria Santos", "09181234567", "cashier"]
  );

  await conn.execute(
    "INSERT INTO users (username, password, fullName, contactNumber, role) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE fullName=VALUES(fullName)",
    ["john", frontdeskHash, "John Cruz", "09191234567", "frontdesk"]
  );

  console.log("Default users seeded in database successfully.");
  await conn.end();
}

seed().catch(console.error);
