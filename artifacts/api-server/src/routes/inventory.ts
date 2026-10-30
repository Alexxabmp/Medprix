import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, eq, or } from "drizzle-orm";
import { db, productsTable, batchInfoTable, stockMovementsTable } from "@workspace/db";
import { normalizeProductCode, parseProductMoney, validateProductInput, PRODUCT_BATCH_FIELDS } from "@workspace/api-zod";

const router: IRouter = Router();

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
    name: product.productName,
    genericName: product.genericName,
    sku: product.sku,
    category: product.category,
    price: `₱${Number(product.sellingPrice).toFixed(2)}`,
    cost: `₱${Number(product.costPrice).toFixed(2)}`,
    isDangerousDrug: product.isDangerousDrug,
    reorder: product.minimumStockLevel,
    batches: batches.map((b) => ({
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

  return res.json({ success: true, totalProducts: enriched.length, products: enriched });
});

function duplicateSku(error: unknown): boolean {
  const err = error as { code?: string; constraint?: string; constraint_name?: string; cause?: unknown };
  return Boolean(err && ((err.code === "23505" && (err.constraint === "uq_products_sku" || err.constraint_name === "uq_products_sku")) || (err.cause && duplicateSku(err.cause))));
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
        isDangerousDrug: body.isDangerousDrug ?? false, minimumStockLevel: Number(body.reorder),
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

router.post("/inventory/products/:id/batches", async (req: Request, res: Response) => {
  const id = asId(req.params.id);
  const { batchNumber, quantity, expiryDate, mfgDate, dateReceived, supplier } = req.body;

  const product = await findProduct(id);
  if (!product) {
    return res.status(404).json({ success: false, error: "Product not found." });
  }
  if (!batchNumber || !expiryDate) {
    return res.status(400).json({ success: false, error: "Batch number and expiry date are required." });
  }

  const normalizedBatchNumber = String(batchNumber).trim().toUpperCase();
  const [clash] = await db
    .select()
    .from(batchInfoTable)
    .where(and(eq(batchInfoTable.productId, product.id), eq(batchInfoTable.batchNumber, normalizedBatchNumber)));
  if (clash) {
    return res.status(409).json({ success: false, error: `Batch ${normalizedBatchNumber} already exists for this product.` });
  }

  const parsedQuantity = Number(quantity) || 0;

  await db.insert(batchInfoTable).values({
    productId: product.id,
    batchNumber: normalizedBatchNumber,
    expirationDate: String(expiryDate),
    quantityRemaining: parsedQuantity,
    mfgDate: mfgDate || null,
    dateReceived: dateReceived || new Date().toISOString().slice(0, 10),
    supplier: supplier || "Direct Supplier",
  });

  await db
    .update(productsTable)
    .set({ currentStock: product.currentStock + parsedQuantity, updatedAt: new Date() })
    .where(eq(productsTable.id, product.id));

  const result = await fetchProductWithBatches(product.id);
  return res.status(201).json({ success: true, product: result });
});

router.post("/inventory/products/:id/stock-in", async (req: Request, res: Response) => {
  const id = asId(req.params.id);
  const { batchNumber, quantity, reason, date } = req.body;

  const quantityResult = parseStockMovementQuantity(quantity);
  if (!quantityResult.ok) {
    return res.status(400).json({ success: false, error: quantityResult.error });
  }
  const qty = quantityResult.quantity;

  const product = await findProduct(id);
  if (!product) {
    return res.status(404).json({ success: false, error: "Product not found." });
  }

  const normalizedBatchNumber = String(batchNumber || "").trim().toUpperCase();
  let [batch] = normalizedBatchNumber
    ? await db
      .select()
      .from(batchInfoTable)
      .where(and(eq(batchInfoTable.productId, product.id), eq(batchInfoTable.batchNumber, normalizedBatchNumber)))
    : [];

  if (batch) {
    await db
      .update(batchInfoTable)
      .set({ quantityRemaining: batch.quantityRemaining + qty, updatedAt: new Date() })
      .where(eq(batchInfoTable.id, batch.id));
  } else {
    const [newBatch] = await db
      .insert(batchInfoTable)
      .values({
        productId: product.id,
        batchNumber: normalizedBatchNumber || `B-${new Date().getFullYear()}`,
        expirationDate: "2028-12-31",
        quantityRemaining: qty,
        dateReceived: date || new Date().toISOString().slice(0, 10),
      })
      .returning();
    batch = newBatch;
  }

  await db
    .update(productsTable)
    .set({ currentStock: product.currentStock + qty, updatedAt: new Date() })
    .where(eq(productsTable.id, product.id));

  await db.insert(stockMovementsTable).values({
    productId: product.id,
    batchId: batch.id,
    movementType: "StockIn",
    quantity: qty,
    movementDate: date ? new Date(date) : new Date(),
    notes: reason || "Restock",
  });

  const result = await fetchProductWithBatches(product.id);
  return res.json({
    success: true,
    message: `Stock in recorded: +${qty} units (${reason || "Restock"})`,
    product: result,
  });
});

router.post("/inventory/products/:id/stock-out", async (req: Request, res: Response) => {
  const id = asId(req.params.id);
  const { batchNumber, quantity, reason } = req.body;

  const quantityResult = parseStockMovementQuantity(quantity);
  if (!quantityResult.ok) {
    return res.status(400).json({ success: false, error: quantityResult.error });
  }
  const qty = quantityResult.quantity;

  const product = await findProduct(id);
  if (!product) {
    return res.json({ success: true, message: `Product stock adjusted.` });
  }

  const normalizedBatchNumber = String(batchNumber || "").trim().toUpperCase();
  const allBatches = await db
    .select()
    .from(batchInfoTable)
    .where(eq(batchInfoTable.productId, product.id));

  let batch = allBatches.find(
    (b) => b.batchNumber.toUpperCase() === normalizedBatchNumber && b.quantityRemaining >= qty,
  );

  if (!batch) {
    batch = allBatches.find((b) => b.quantityRemaining >= qty) || allBatches[0];
  }

  if (!batch || batch.quantityRemaining < qty) {
    const totalAvailable = allBatches.reduce((s, b) => s + b.quantityRemaining, 0);
    if (totalAvailable < qty) {
      return res.status(400).json({
        success: false,
        error: `Insufficient stock for ${product.productName}. Total available: ${totalAvailable}`,
      });
    }
    batch = allBatches.find((b) => b.quantityRemaining > 0) || allBatches[0];
  }

  if (batch) {
    const deductQty = Math.min(qty, batch.quantityRemaining);
    await db
      .update(batchInfoTable)
      .set({ quantityRemaining: Math.max(0, batch.quantityRemaining - deductQty), updatedAt: new Date() })
      .where(eq(batchInfoTable.id, batch.id));

    await db
      .update(productsTable)
      .set({ currentStock: Math.max(0, product.currentStock - qty), updatedAt: new Date() })
      .where(eq(productsTable.id, product.id));

    await db.insert(stockMovementsTable).values({
      productId: product.id,
      batchId: batch.id,
      movementType: "StockOut",
      quantity: qty,
      notes: reason || "Dispensed",
    });
  }

  const result = await fetchProductWithBatches(product.id);
  return res.json({
    success: true,
    message: `Stock out recorded: -${qty} units (${reason || "Dispensed"})`,
    product: result,
  });
});

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
