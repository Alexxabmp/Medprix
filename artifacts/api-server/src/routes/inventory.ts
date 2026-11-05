import { pharmacyDate } from "@workspace/api-zod";
import { createStockMutations } from "../lib/stock-mutations";
import { CheckoutError } from "../lib/atomic-checkout";
import { requireAuth, requireRoles } from "../middleware/auth";
import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, eq, or } from "drizzle-orm";
import { db, withTransaction, productsTable, batchInfoTable, stockMovementsTable } from "@workspace/db";
import { normalizeProductCode, parseProductMoney, validateProductInput, PRODUCT_BATCH_FIELDS } from "@workspace/api-zod";

const router: IRouter = Router();
const stockMutations = createStockMutations(withTransaction);

const NOW = () => new Date();
const MAX_STOCK_MOVEMENT_QUANTITY = 1_000_000;

function parseStockMovementQuantity(value: unknown):
  | { ok: true; quantity: number }
  | { ok: false; error: string } {
  if (value === undefined || value === null || String(value).trim() === "") {
    return { ok: false, error: "Quantity is required." };
  }

  const quantity = Number(value);
  if (!Number.isFinite(quantity)) return { ok: false, error: "Quantity must be a valid finite number." };
  if (!Number.isInteger(quantity)) return { ok: false, error: "Quantity must be a whole number." };
  if (quantity <= 0) return { ok: false, error: "Quantity must be greater than zero." };
  if (quantity > MAX_STOCK_MOVEMENT_QUANTITY) {
    return { ok: false, error: `Quantity cannot exceed ${MAX_STOCK_MOVEMENT_QUANTITY.toLocaleString()} units.` };
  }
  return { ok: true, quantity };
}

function asId(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] : (value ?? "");
}

function toApiProduct(product: typeof productsTable.$inferSelect, batches: (typeof batchInfoTable.$inferSelect)[]) {
  const stock = batches.reduce((sum, b) => sum + b.quantityRemaining, 0);
  return {
    id: product.id,
    pharmacyDate: pharmacyDate(),
    name: product.productName,
    genericName: product.genericName,
    sku: product.sku,
    category: product.category,
    price: `₱${Number(product.sellingPrice).toFixed(2)}`,
    cost: `₱${Number(product.costPrice).toFixed(2)}`,
    isDangerousDrug: product.isDangerousDrug,
    isVatExempt: product.isVatExempt,
    reorder: product.minimumStockLevel,
    batches: batches.map((b) => ({
      id: b.id,
      batchNumber: b.batchNumber,
      quantity: b.quantityRemaining,
      expiryDate: b.expirationDate,
      mfgDate: b.mfgDate ?? undefined,
      dateReceived: b.dateReceived ?? undefined,
      supplier: b.supplier ?? undefined,
    })),
    stock,
  };
}

async function findProduct(idOrSkuOrRef: string) {
  const clean = String(idOrSkuOrRef || "").trim();
  if (!clean) return null;

  // Direct ID or SKU match
  const [direct] = await db
    .select()
    .from(productsTable)
    .where(
      or(
        ...(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean) ? [eq(productsTable.id, clean)] : []),
        eq(productsTable.sku, clean),
        eq(productsTable.sku, clean.toUpperCase()),
      ),
    );
  if (direct) return direct;

  // Check p1..p99 fallback to seeded product IDs
  const pMatch = /^p(\d+)$/i.exec(clean);
  if (pMatch) {
    const num = parseInt(pMatch[1], 10);
    const padded = `00000000-0000-0000-0000-${String(num).padStart(12, "0")}`;
    const [pSeed] = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, padded));
    if (pSeed) return pSeed;
  }

  // Fallback: check all products
  const all = await db.select().from(productsTable);
  const matched = all.find(
    (p) =>
      p.id.toLowerCase() === clean.toLowerCase() ||
      p.sku.toLowerCase() === clean.toLowerCase() ||
      p.productName.toLowerCase().includes(clean.toLowerCase()),
  );
  return matched || null;
}

async function fetchProductWithBatches(productId: string) {
  const product = await findProduct(productId);
  if (!product) return null;
  const batches = await db
    .select()
    .from(batchInfoTable)
    .where(eq(batchInfoTable.productId, product.id));
  return toApiProduct(product, batches);
}

router.get("/inventory", async (_req: Request, res: Response) => {
  const now = NOW();
  const allProducts = await db
    .select()
    .from(productsTable)
    .orderBy(asc(productsTable.productName), asc(productsTable.sku));
  const allBatches = await db.select().from(batchInfoTable);

  const enriched = allProducts.map((p) => {
    const batches = allBatches.filter((b) => b.productId === p.id);
    const stock = batches.reduce((sum, b) => sum + b.quantityRemaining, 0);

    const expiredBatches = batches.filter((b) => {
      const exp = new Date(b.expirationDate);
      return !isNaN(exp.getTime()) && exp < now && b.quantityRemaining > 0;
    });
    const expiringSoonBatches = batches.filter((b) => {
      const exp = new Date(b.expirationDate);
      if (isNaN(exp.getTime()) || exp < now || b.quantityRemaining <= 0) return false;
      const diffDays = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return diffDays <= 60;
    });

    let status = "In Stock";
    if (expiredBatches.length > 0) status = "Expired";
    else if (stock === 0) status = "Out of Stock";
    else if (expiringSoonBatches.length > 0) status = "Expiring Soon";
    else if (stock <= p.minimumStockLevel) status = "Low Stock";

    return { ...toApiProduct(p, batches), status, expiredBatches, expiringSoonBatches };
  });

  const nextDay = new Date(`${pharmacyDate(now)}T00:00:00+08:00`).getTime() + 86_400_000;
  return res.json({ success: true, pharmacyDate: pharmacyDate(now), pharmacyDayRemainingMs: Math.max(1, nextDay - now.getTime()), totalProducts: enriched.length, products: enriched });
});

function duplicateSku(error: unknown): boolean {
  const err = error as { code?: string; constraint?: string; constraint_name?: string; cause?: unknown };
  return Boolean(err && ((err.code === "23505" && [err.constraint, err.constraint_name].some(name => name === "uq_products_sku" || name === "uq_products_sku_ci")) || (err.cause && duplicateSku(err.cause))));
}

router.post("/inventory/products", async (req: Request, res: Response) => {
  const body = req.body ?? {};
  const errors = validateProductInput(body, { batch: true });
  if (Object.keys(errors).length) return res.status(400).json({ success: false, error: Object.values(errors)[0], errors });
  const sku = normalizeProductCode(body.sku);
  const [existing] = await db.select().from(productsTable).where(eq(productsTable.sku, sku));
  if (existing) return res.status(409).json({ success: false, error: "This product code already exists.", errors: { sku: "Choose a different product code." } });
  const hasBatch = PRODUCT_BATCH_FIELDS.some((key) => body[key] !== undefined && body[key] !== null);
  try {
    const product = await db.transaction(async (tx) => {
      const [saved] = await tx.insert(productsTable).values({
        sku, productName: body.name.trim(), genericName: body.genericName.trim(), category: (body.category ?? "").trim(),
        sellingPrice: parseProductMoney(body.price)!, costPrice: parseProductMoney(body.costPrice)!,
        isDangerousDrug: body.isDangerousDrug ?? false, isVatExempt: body.isVatExempt, minimumStockLevel: Number(body.reorder),
        currentStock: hasBatch ? Number(body.quantity) : 0,
      }).returning();
      if (hasBatch) await tx.insert(batchInfoTable).values({
        productId: saved.id, batchNumber: body.batchNumber.trim().toUpperCase(), expirationDate: body.expiryDate,
        quantityRemaining: Number(body.quantity), mfgDate: body.mfgDate || null, dateReceived: body.dateReceived || null,
        supplier: body.supplier?.trim() || null,
      });
      return saved;
    });
    return res.status(201).json({ success: true, product: await fetchProductWithBatches(product.id) });
  } catch (error) {
    if (duplicateSku(error)) return res.status(409).json({ success: false, error: "This product code already exists.", errors: { sku: "Choose a different product code." } });
    throw error;
  }
});

router.put("/inventory/products/:id", async (req: Request, res: Response) => {
  const product = await findProduct(asId(req.params.id));
  if (!product) return res.status(404).json({ success: false, error: "Product not found." });
  const body = req.body ?? {};
  const errors = validateProductInput(body, { partial: true, originalSku: product.sku });
  if (Object.keys(errors).length) return res.status(400).json({ success: false, error: Object.values(errors)[0], errors });
  const updates: Partial<typeof productsTable.$inferInsert> = { updatedAt: new Date() };
  if (body.name !== undefined) updates.productName = body.name.trim();
  if (body.genericName !== undefined) updates.genericName = body.genericName.trim();
  if (body.sku !== undefined) updates.sku = normalizeProductCode(body.sku, product.sku);
  if (body.category !== undefined) updates.category = body.category.trim();
  if (body.price !== undefined) updates.sellingPrice = parseProductMoney(body.price)!;
  if (body.costPrice !== undefined) updates.costPrice = parseProductMoney(body.costPrice)!;
  if (body.isVatExempt !== undefined) updates.isVatExempt = body.isVatExempt;
  if (body.isDangerousDrug !== undefined) updates.isDangerousDrug = body.isDangerousDrug;
  if (body.reorder !== undefined) updates.minimumStockLevel = Number(body.reorder);
  try {
    await db.update(productsTable).set(updates).where(eq(productsTable.id, product.id));
    return res.json({ success: true, product: await fetchProductWithBatches(product.id) });
  } catch (error) {
    if (duplicateSku(error)) return res.status(409).json({ success: false, error: "This product code already exists.", errors: { sku: "Choose a different product code." } });
    throw error;
  }
});

function validStockDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

for (const kind of ["batches", "stock-in", "stock-out"] as const) {
  const roles: Array<"Admin" | "FrontDesk" | "Cashier"> = kind === "batches" ? ["Admin", "FrontDesk"] : ["Admin", "Cashier"];
  router.post(`/inventory/products/:id/${kind}`, requireAuth, requireRoles(...roles), async (req: Request, res: Response) => {
    const body = req.body ?? {};
    if (["batchNumber", "reason", "supplier"].some((key) => body[key] != null && typeof body[key] !== "string")) return res.status(400).json({ error: "Enter valid stock movement details." });
    const quantity = parseStockMovementQuantity(body.quantity);
    if (!quantity.ok) return res.status(400).json({ error: quantity.error });
    const product = await findProduct(asId(req.params.id));
    if (!product) return res.status(404).json({ error: "Product not found." });
    const batchNumber = String(body.batchNumber || "").trim().toUpperCase();
    if (batchNumber.length > 100 || (kind !== "stock-out" && !batchNumber)) return res.status(400).json({ error: "Enter a batch number of at most 100 characters." });
    if (kind === "stock-in" && ["expiryDate", "mfgDate", "supplier"].some(key => body[key] != null && body[key] !== "")) return res.status(400).json({ error: "Record Stock In uses the existing batch details. Use Add Batch to create a different lot." });
    if ((kind === "batches" && !validStockDate(body.expiryDate)) || (body.date && !validStockDate(body.date)) || (body.dateReceived && !validStockDate(body.dateReceived)) || (body.mfgDate && !validStockDate(body.mfgDate))) return res.status(400).json({ error: "Enter valid stock movement dates." });
    if (String(body.reason || "").length > 500 || String(body.supplier || "").length > 255) return res.status(400).json({ error: "Stock movement details are too long." });
    try {
      const input = { quantity: quantity.quantity, batchNumber, reason: body.reason, date: body.date || body.dateReceived,
        ...(kind === "batches" ? { newBatch: { expiryDate: body.expiryDate, mfgDate: body.mfgDate, supplier: body.supplier } } : {}) };
      if (kind === "stock-out") await stockMutations.stockOut(product.id, input);
      else await stockMutations.stockIn(product.id, input);
      return res.status(kind === "batches" ? 201 : 200).json({ success: true, product: await fetchProductWithBatches(product.id) });
    } catch (error) {
      if (error instanceof CheckoutError) return res.status(error.status).json({ error: error.message, ...error.details });
      throw error;
    }
  });
}

router.delete("/inventory/products/:id", async (req: Request, res: Response) => {
  const id = asId(req.params.id);
  const product = await findProduct(id);
  if (!product) {
    return res.status(404).json({ success: false, error: "Product not found." });
  }

  await db.delete(batchInfoTable).where(eq(batchInfoTable.productId, product.id));
  await db.delete(stockMovementsTable).where(eq(stockMovementsTable.productId, product.id));
  await db.delete(productsTable).where(eq(productsTable.id, product.id));

  return res.json({ success: true, message: `Product ${product.productName} deleted.` });
});

export default router;
