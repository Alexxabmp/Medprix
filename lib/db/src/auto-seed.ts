import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import bcrypt from "bcrypt";
import type { PGlite } from "@electric-sql/pglite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function autoInitPglite(pg: PGlite) {
  try {
    // Check if tables exist
    let hasTables = false;
    try {
      const res = await pg.query<{ count: number }>("SELECT count(*)::int as count FROM information_schema.tables WHERE table_schema='public' AND table_name='users'");
      if (Number(res.rows[0]?.count) > 0) {
        hasTables = true;
      }
    } catch {
      hasTables = false;
    }

    if (!hasTables) {
      const candidates = [
        path.resolve(__dirname, "../drizzle/0000_fuzzy_shinko_yamashiro.sql"),
        path.resolve(process.cwd(), "lib/db/drizzle/0000_fuzzy_shinko_yamashiro.sql"),
      ];
      let sqlFile = "";
      for (const c of candidates) {
        if (fs.existsSync(c)) {
          sqlFile = c;
          break;
        }
      }

      if (sqlFile) {
        const rawSql = fs.readFileSync(sqlFile, "utf8");
        const statements = rawSql
          .split("--> statement-breakpoint")
          .map((s) => s.trim())
          .filter(Boolean);

        for (const stmt of statements) {
          await pg.exec(stmt);
        }
      }
    }

    // Check if users exist
    const userRes = await pg.query<{ count: number }>("SELECT count(*)::int as count FROM users");
    if (Number(userRes.rows[0]?.count) === 0) {
      const hash = await bcrypt.hash("Password123!", 10);
      const users = [
        { id: randomUUID(), username: "admin", full_name: "Ana Reyes", role: "Admin" },
        { id: randomUUID(), username: "frontdesk1", full_name: "Grace Villanueva", role: "FrontDesk" },
        { id: randomUUID(), username: "cashier1", full_name: "Jose Dela Cruz", role: "Cashier" },
        { id: randomUUID(), username: "cashier", full_name: "Maria Santos", role: "Cashier" },
        { id: randomUUID(), username: "frontdesk", full_name: "John Cruz", role: "FrontDesk" },
      ];

      for (const u of users) {
        await pg.query(
          `INSERT INTO users (id, username, password_hash, full_name, role, is_active)
           VALUES ($1, $2, $3, $4, $5, true)`,
          [u.id, u.username, hash, u.full_name, u.role],
        );
      }

      // Seed suppliers
      const suppliers = [
        { id: randomUUID(), name: "Mindanao MedSupply Corp.", person: "Ramon Aquino", terms: "Net 30" },
        { id: randomUUID(), name: "Davao Pharma Distributors Inc.", person: "Teresita Lim", terms: "Net 15" },
        { id: randomUUID(), name: "Southern Health Wholesale", person: "Antonio Uy", terms: "Net 45" },
      ];
      for (const s of suppliers) {
        await pg.query(
          `INSERT INTO suppliers (id, supplier_name, contact_person, payment_terms)
           VALUES ($1, $2, $3, $4)`,
          [s.id, s.name, s.person, s.terms],
        );
      }

      // Seed products
      const products = [
        { id: randomUUID(), sku: "MED-0421", name: "Paracetamol 500mg", generic: "Acetaminophen", cat: "Pain relief", price: "12.50", cost: "6.00", min: 200, stock: 450 },
        { id: randomUUID(), sku: "MED-0892", name: "Amoxicillin 500mg", generic: "Amoxicillin Trihydrate", cat: "Antibiotics", price: "18.75", cost: "9.50", min: 100, stock: 85 },
        { id: randomUUID(), sku: "MED-0144", name: "Ibuprofen 400mg", generic: "Ibuprofen", cat: "Pain relief", price: "14.00", cost: "7.20", min: 80, stock: 120 },
        { id: randomUUID(), sku: "MED-0551", name: "Cetirizine 10mg", generic: "Cetirizine Dihydrochloride", cat: "Antihistamines", price: "9.25", cost: "4.10", min: 150, stock: 310 },
        { id: randomUUID(), sku: "MED-0733", name: "Metformin 500mg", generic: "Metformin Hydrochloride", cat: "Chronic care", price: "8.50", cost: "3.80", min: 250, stock: 520 },
        { id: randomUUID(), sku: "MED-0912", name: "Omeprazole 20mg", generic: "Omeprazole", cat: "Digestive", price: "22.00", cost: "11.00", min: 60, stock: 40 },
      ];
      for (const p of products) {
        await pg.query(
          `INSERT INTO products (id, sku, product_name, generic_name, category, selling_price, cost_price, minimum_stock_level, current_stock)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [p.id, p.sku, p.name, p.generic, p.cat, p.price, p.cost, p.min, p.stock],
        );
        await pg.query(
          `INSERT INTO batch_info (id, product_id, batch_number, expiration_date, quantity_remaining, supplier)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [randomUUID(), p.id, `BATCH-${p.sku}-01`, "2027-08-31", p.stock, "Mindanao MedSupply Corp."],
        );
      }

      // Sample Purchase Order
      const poId = randomUUID();
      await pg.query(
        `INSERT INTO purchase_orders (id, supplier_id, po_number, status, total_order_amount)
         VALUES ($1, $2, $3, $4, $5)`,
        [poId, suppliers[0].id, "PO-2026-0001", "Submitted", "15000.00"],
      );
      await pg.query(
        `INSERT INTO po_items (id, po_id, product_id, quantity_ordered, unit_cost, line_total)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [randomUUID(), poId, products[0].id, 1000, "6.00", "6000.00"],
      );

      const delId = randomUUID();
      await pg.query(
        `INSERT INTO supplier_deliveries (id, po_id, delivery_date, delivery_status)
         VALUES ($1, $2, now(), 'Received')`,
        [delId, poId],
      );
      await pg.query(
        `INSERT INTO delivery_items (id, delivery_id, product_id, batch_number, expiration_date, quantity_delivered)
         VALUES ($1, $2, $3, $4, '2027-08-31', 500)`,
        [randomUUID(), delId, products[0].id, `BATCH-${products[0].sku}-01`],
      );

      await pg.query(
        `INSERT INTO supplier_invoices (id, supplier_id, po_id, invoice_number, due_date, invoice_amount, is_paid)
         VALUES ($1, $2, $3, 'INV-2026-001', '2026-10-31', '15000.00', false)`,
        [randomUUID(), suppliers[0].id, poId],
      );
    }

    // Ensure persistent cashier transactions & logs tables exist
    await pg.exec(`
      CREATE TABLE IF NOT EXISTS cashier_transactions (
        id SERIAL PRIMARY KEY,
        transaction_number VARCHAR(100) UNIQUE NOT NULL,
        date_time VARCHAR(100) NOT NULL,
        user_name VARCHAR(150) NOT NULL,
        business_type VARCHAR(50) NOT NULL DEFAULT 'Retail',
        customer VARCHAR(150) NOT NULL DEFAULT 'Walk-in Customer',
        total VARCHAR(50) NOT NULL,
        subtotal VARCHAR(50) NOT NULL,
        discount VARCHAR(50) NOT NULL DEFAULT '₱0.00',
        vat VARCHAR(50) NOT NULL DEFAULT '₱0.00',
        amount_received VARCHAR(50) NOT NULL DEFAULT '₱0.00',
        change VARCHAR(50) NOT NULL DEFAULT '₱0.00',
        payment VARCHAR(50) NOT NULL DEFAULT 'Cash',
        status VARCHAR(50) NOT NULL DEFAULT 'Completed',
        items JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS cashier_system_logs (
        id SERIAL PRIMARY KEY,
        date_time VARCHAR(100) NOT NULL,
        user_name VARCHAR(150) NOT NULL,
        role VARCHAR(50) NOT NULL,
        action VARCHAR(100) NOT NULL,
        module VARCHAR(100) NOT NULL,
        description TEXT NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'Success',
        device_ip VARCHAR(50) NOT NULL DEFAULT '127.0.0.1',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS cashier_user_activities (
        id SERIAL PRIMARY KEY,
        date_time VARCHAR(100) NOT NULL,
        user_name VARCHAR(150) NOT NULL,
        role VARCHAR(50) NOT NULL,
        activity VARCHAR(150) NOT NULL,
        module VARCHAR(100) NOT NULL,
        description TEXT NOT NULL,
        flag VARCHAR(50) NOT NULL DEFAULT 'Normal',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
  } catch (err) {
    console.error("autoInitPglite notice:", err);
  }
}
