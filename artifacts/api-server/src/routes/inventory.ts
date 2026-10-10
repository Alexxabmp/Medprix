import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq } from "drizzle-orm";
import { db, productsTable, batchInfoTable, stockMovementsTable } from "@workspace/db";

const router: IRouter = Router();

const NOW = () => new Date();

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

async function fetchProductWithBatches(productId: string) {
  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, productId));
  if (!product) return null;
  const batches = await db.select().from(batchInfoTable).where(eq(batchInfoTable.productId, productId));
  return toApiProduct(product, batches);
}

router.get("/inventory", async (_req: Request, res: Response) => {
  const now = NOW();
  const allProducts = await db.select().from(productsTable);
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

router.post("/inventory/products", async (req: Request, res: Response) => {
  const {
    name, genericName, sku, category, price, costPrice, isDangerousDrug, reorder,
    batchNumber, quantity, expiryDate, mfgDate, dateReceived, supplier,
  } = req.body;


  if (!name || !sku) {
    return res.status(400).json({ success: false, error: "Product name and SKU are required." });
  }

  const normalizedSku = String(sku).trim().toUpperCase();
  const [existing] = await db.select().from(productsTable).where(eq(productsTable.sku, normalizedSku));
  if (existing) {
    return res.status(409).json({ success: false, error: `SKU ${normalizedSku} already exists.` });
  }

  const sellingPrice = String(price ?? "0").replace(/[^\d.]/g, "") || "0";
  const parsedCostPrice = String(costPrice ?? "0").replace(/[^\d.]/g, "") || "0";
  const parsedQuantity = Number(quantity) || 0;

  const [product] = await db
    .insert(productsTable)
    .values({
      sku: normalizedSku,
      productName: String(name).trim(),
      genericName: String(genericName || name).trim(),
      category: String(category || "General"),
      sellingPrice,
      costPrice: parsedCostPrice,
      isDangerousDrug: Boolean(isDangerousDrug),
      minimumStockLevel: Number(reorder) || 10,
      currentStock: parsedQuantity,
    })
    .returning();

  await db.insert(batchInfoTable).values({
    productId: product.id,
    batchNumber: String(batchNumber || "B001").trim().toUpperCase(),
    expirationDate: String(expiryDate || "2027-12-31"),
    quantityRemaining: parsedQuantity,
    mfgDate: mfgDate || null,
    dateReceived: dateReceived || new Date().toISOString().slice(0, 10),
    supplier: supplier || "Direct Delivery",
  });

  const result = await fetchProductWithBatches(product.id);
  return res.status(201).json({ success: true, product: result });
});

router.put("/inventory/products/:id", async (req: Request, res: Response) => {
  const id = asId(req.params.id);
  const { name, genericName, sku, category, price, costPrice, isDangerousDrug, reorder } = req.body;

  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, id));
  if (!product) {
    return res.status(404).json({ success: false, error: "Product not found." });
  }

  if (sku) {
    const normalizedSku = String(sku).trim().toUpperCase();
    if (normalizedSku !== product.sku) {
      const [clash] = await db.select().from(productsTable).where(eq(productsTable.sku, normalizedSku));
      if (clash) {
        return res.status(409).json({ success: false, error: `SKU ${normalizedSku} already exists.` });
      }
    }
  }

  const updates: Partial<typeof productsTable.$inferInsert> = { updatedAt: new Date() };
  if (name) updates.productName = String(name).trim();
  if (genericName) updates.genericName = String(genericName).trim();
  if (sku) updates.sku = String(sku).trim().toUpperCase();
  if (category) updates.category = String(category);
  if (price) updates.sellingPrice = String(price).replace(/[^\d.]/g, "") || "0";
  if (costPrice) updates.costPrice = String(costPrice).replace(/[^\d.]/g, "") || "0";
  if (isDangerousDrug !== undefined) updates.isDangerousDrug = Boolean(isDangerousDrug);
  if (reorder !== undefined) updates.minimumStockLevel = Number(reorder);

  await db.update(productsTable).set(updates).where(eq(productsTable.id, id));

  const result = await fetchProductWithBatches(id);
  return res.json({ success: true, product: result });
});

router.post("/inventory/products/:id/batches", async (req: Request, res: Response) => {
  const id = asId(req.params.id);
  const { batchNumber, quantity, expiryDate, mfgDate, dateReceived, supplier } = req.body;

  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, id));
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
    .where(and(eq(batchInfoTable.productId, id), eq(batchInfoTable.batchNumber, normalizedBatchNumber)));
  if (clash) {
    return res.status(409).json({ success: false, error: `Batch ${normalizedBatchNumber} already exists for this product.` });
  }

  const parsedQuantity = Number(quantity) || 0;

  await db.insert(batchInfoTable).values({
    productId: id,
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
    .where(eq(productsTable.id, id));

  const result = await fetchProductWithBatches(id);
  return res.status(201).json({ success: true, product: result });
});

router.post("/inventory/products/:id/stock-in", async (req: Request, res: Response) => {
  const id = asId(req.params.id);
  const { batchNumber, quantity, reason, date } = req.body;

  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, id));
  if (!product) {
    return res.status(404).json({ success: false, error: "Product not found." });
  }

  const qty = Number(quantity);
  if (!qty || qty <= 0) {
    return res.status(400).json({ success: false, error: "Positive quantity required." });
  }

  const normalizedBatchNumber = String(batchNumber || "").trim().toUpperCase();
  let [batch] = normalizedBatchNumber
    ? await db
      .select()
      .from(batchInfoTable)
      .where(and(eq(batchInfoTable.productId, id), eq(batchInfoTable.batchNumber, normalizedBatchNumber)))
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
        productId: id,
        batchNumber: normalizedBatchNumber || "B-NEW",
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
    .where(eq(productsTable.id, id));

  await db.insert(stockMovementsTable).values({
    productId: id,
    batchId: batch.id,
    movementType: "StockIn",
    quantity: qty,
    movementDate: date ? new Date(date) : new Date(),
    notes: reason || "Restock",
  });

  const result = await fetchProductWithBatches(id);
  return res.json({
    success: true,
    message: `Stock in recorded: +${qty} units (${reason || "Restock"})`,
    product: result,
  });
});

router.post("/inventory/products/:id/stock-out", async (req: Request, res: Response) => {
  const id = asId(req.params.id);
  const { batchNumber, quantity, reason } = req.body;

  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, id));
  if (!product) {
    return res.status(404).json({ success: false, error: "Product not found." });
  }

  const qty = Number(quantity);
  if (!qty || qty <= 0) {
    return res.status(400).json({ success: false, error: "Positive quantity required." });
  }

  const normalizedBatchNumber = String(batchNumber || "").trim().toUpperCase();
  const [batch] = await db
    .select()
    .from(batchInfoTable)
    .where(and(eq(batchInfoTable.productId, id), eq(batchInfoTable.batchNumber, normalizedBatchNumber)));

  if (!batch || batch.quantityRemaining < qty) {
    return res.status(400).json({
      success: false,
      error: `Insufficient stock in batch ${normalizedBatchNumber}. Current: ${batch?.quantityRemaining || 0}`,
    });
  }

  await db
    .update(batchInfoTable)
    .set({ quantityRemaining: batch.quantityRemaining - qty, updatedAt: new Date() })
    .where(eq(batchInfoTable.id, batch.id));

  await db
    .update(productsTable)
    .set({ currentStock: Math.max(0, product.currentStock - qty), updatedAt: new Date() })
    .where(eq(productsTable.id, id));

  await db.insert(stockMovementsTable).values({
    productId: id,
    batchId: batch.id,
    movementType: "StockOut",
    quantity: qty,
    notes: reason || "Dispensed",
  });

  const result = await fetchProductWithBatches(id);
  return res.json({
    success: true,
    message: `Stock out recorded: -${qty} units (${reason || "Dispensed"})`,
    product: result,
  });
});

export default router;