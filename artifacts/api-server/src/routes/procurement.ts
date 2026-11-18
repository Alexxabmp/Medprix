import { deliveryKey, deliveryPayload, deliveryDecision, readDelivery, submitDelivery, completeDelivery, DeliveryInputError, DeliveryNotFoundError, DeliveryReferenceConflict } from "../lib/supplier-delivery-submissions";
import { randomUUID } from "node:crypto";
import { pharmacyDate } from "@workspace/api-zod";
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { asc, desc, eq, ilike, or, and } from "drizzle-orm";
import {
  db,
  queryDb,
  poItemsTable,
  productsTable,
  batchInfoTable,
  stockMovementsTable,
  purchaseOrdersTable,
  supplierDeliveriesTable,
  deliveryItemsTable,
  supplierInvoicesTable,
  suppliersTable,
  accountsPayableTable,
} from "@workspace/db";
import { requireAuth, requireRoles } from "../middleware/auth";

import { createSettlementService, SettlementError } from "../lib/supplier-payments";
import { identifierConflict } from "../lib/identifier-conflicts";
import { readSupplierPayables, readSupplierInvoices, readSupplierHistory } from "../lib/supplier-payable-read-model";
import { readReceivedQuantities, readOrderReceivingState, ReceivingError } from "../lib/supplier-stock-receipts";

const settlement = createSettlementService(db);
const router: IRouter = Router();
const poStatuses = purchaseOrdersTable.status.enumValues;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const contactPattern = /^(?:\+639|09)\d{9}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function asId(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] : (value ?? "");
}

function formatAmount(value: string | number): string {
  return Number(value || 0).toFixed(2);
}

async function findSupplier(idOrName: string) {
  const clean = String(idOrName || "").trim();
  if (!clean) return null;
  const allSuppliers = await db.select().from(suppliersTable);
  const byId = allSuppliers.find(
    (s) => s.id === clean || s.id.toLowerCase() === clean.toLowerCase(),
  );
  if (byId) return byId;
  const byName = allSuppliers.find(
    (s) =>
      s.supplierName.toLowerCase() === clean.toLowerCase() ||
      s.supplierName.toLowerCase().includes(clean.toLowerCase()) ||
      clean.toLowerCase().includes(s.supplierName.toLowerCase()),
  );
  if (byName) return byName;
  return null;
}

async function findProduct(idOrSkuOrName: string) {
  const clean = String(idOrSkuOrName || "").trim();
  if (!clean) return null;
  const allProducts = await db.select().from(productsTable);
  const byId = allProducts.find(
    (p) => p.id === clean || p.id.toLowerCase() === clean.toLowerCase(),
  );
  if (byId) return byId;
  const pMatch = /^p(\d+)$/i.exec(clean);
  if (pMatch) {
    const num = parseInt(pMatch[1], 10);
    const padded = `00000000-0000-0000-0000-${String(num).padStart(12, "0")}`;
    const pSeed = allProducts.find((p) => p.id === padded);
    if (pSeed) return pSeed;
  }
  const bySku = allProducts.find(
    (p) => p.sku.toLowerCase() === clean.toLowerCase(),
  );
  if (bySku) return bySku;
  const byName = allProducts.find(
    (p) =>
      p.productName.toLowerCase() === clean.toLowerCase() ||
      p.productName.toLowerCase().includes(clean.toLowerCase()) ||
      clean.toLowerCase().includes(p.productName.toLowerCase()),
  );
  if (byName) return byName;
  return null;
}

async function findOrder(idOrPoNumber: string) {
  const clean = String(idOrPoNumber || "").trim();
  if (!clean) return null;
  const allOrders = await db.select().from(purchaseOrdersTable);
  const byId = allOrders.find(
    (o) => o.id === clean || o.id.toLowerCase() === clean.toLowerCase(),
  );
  if (byId) return byId;
  const byPo = allOrders.find(
    (o) => o.poNumber.toLowerCase() === clean.toLowerCase(),
  );
  if (byPo) return byPo;
  return null;
}

router.use(requireAuth);
router.use(requireRoles("Admin", "FrontDesk"));

router.post(
  "/suppliers",
  requireRoles("Admin"),
  async (req: Request, res: Response) => {
    const {
      supplierName,
      contactPerson,
      contactNumber,
      email,
      address,
      paymentTerms,
    } = req.body ?? {};
    const name = typeof supplierName === "string" ? supplierName.trim() : "";
    const contact =
      typeof contactPerson === "string" ? contactPerson.trim() : "";
    const phone = typeof contactNumber === "string" ? contactNumber.trim() : "";
    const emailAddress =
      typeof email === "string" ? email.trim().toLowerCase() : "";
    const supplierAddress = typeof address === "string" ? address.trim() : "";
    const terms = typeof paymentTerms === "string" ? paymentTerms.trim() : "";

    if (terms !== "Net30" && terms !== "Net60")
      return res.status(400).json({ error: "Payment terms must be Net30 or Net60." });
    if (paymentTerms != null && typeof paymentTerms !== "string")
      return res.status(400).json({ error: "Payment terms must be Net30 or Net60." });

    if (!name)
      return res.status(400).json({ error: "Supplier name is required." });
    if (
      name.length < 2 ||
      name.length > 120 ||
      !/^[\p{L}\p{N}][\p{L}\p{N}\s&.,'()/-]*$/u.test(name)
    ) {
      return res.status(400).json({
        error:
          "Supplier name must be 2 to 120 characters and contain only standard name characters.",
      });
    }
    if (phone && !contactPattern.test(phone)) {
      return res.status(400).json({
        error: "Contact number must use 09XXXXXXXXX or +639XXXXXXXXX format.",
      });
    }
    if (emailAddress && !emailPattern.test(emailAddress)) {
      return res.status(400).json({ error: "Enter a valid email address." });
    }
    if (
      contact.length > 120 ||
      emailAddress.length > 255 ||
      supplierAddress.length > 500 ||
      terms.length > 100
    ) {
      return res.status(400).json({
        error: "One or more supplier details exceed the allowed length.",
      });
    }

    const [duplicate] = await db
      .select({ id: suppliersTable.id })
      .from(suppliersTable)
      .where(ilike(suppliersTable.supplierName, name));
    if (duplicate)
      return res
        .status(409)
        .json({ error: "A supplier with this name already exists." });

    try {
      const [supplier] = await db
        .insert(suppliersTable)
        .values({
          supplierName: name,
          contactPerson: contact || null,
          contactNumber: phone || null,
          email: emailAddress || null,
          address: supplierAddress || null,
          paymentTerms: terms,
        })
        .returning();
      return res.status(201).json({ success: true, supplier });
    } catch {
      return res.status(500).json({ error: "Failed to add supplier." });
    }
  },
);

router.get(
  "/suppliers/:id/history",
  requireRoles("Admin", "FrontDesk"),
  async (req: Request, res: Response) => {
    const supplierId = asId(req.params.id);
    if (!uuidPattern.test(supplierId))
      return res.status(400).json({ error: "Invalid supplier ID." });

    const [supplier] = await db
      .select()
      .from(suppliersTable)
      .where(eq(suppliersTable.id, supplierId));
    if (!supplier)
      return res.status(404).json({ error: "Supplier not found." });
    const [orders, deliveries, model] = await Promise.all([
      db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.supplierId,supplierId)).orderBy(desc(purchaseOrdersTable.orderDate)),
      db.select().from(supplierDeliveriesTable),
      readSupplierHistory(queryDb,supplierId),
    ]);
    const invoices=model.invoices,payables=model.payables;
    const orderIds = orders.map((order) => order.id);
    const supplierDeliveries = orderIds.length
      ? deliveries.filter((delivery) => orderIds.includes(delivery.poId))
      : [];
    const payments=model.payments;

    return res.json({
      success: true,
      supplier,
      summary: {
        totalOrders: orders.length,
        totalOrdered: formatAmount(
          orders.reduce(
            (sum, order) => sum + Number(order.totalOrderAmount),
            0,
          ),
        ),
        totalPaid: model.totalPaid,
        openBalance: model.summary.totalOpen,
        needsReview: model.summary.needsReview,
        invoicesNeedingReview: model.reconciliation.invoicesNeedingReview,
      },
      orders,
      deliveries: supplierDeliveries,
      invoices,
      payables,
      payments,
    });
  },
);

router.get(
  "/accounts-payable",
  requireRoles("Admin", "FrontDesk"),
  async (_req: Request, res: Response) => {
    const model=await readSupplierPayables(queryDb);
    return res.json({success:true,accountsPayable:model.payables,summary:model.summary,reconciliation:model.reconciliation});
  },
);

router.post("/supplier-payments", async (req: Request, res: Response) => {
  try {
    const result = await settlement.save(req.body, req.get("Idempotency-Key"));
    return res.status(result.replayed ? 200 : 201).json({ success: true, ...result });
  } catch (error) {
    if (error instanceof SettlementError) return res.status(error.status).json({ error: error.message });
    throw error;
  }
});

router.get("/supplier-payments/:key", async (req: Request, res: Response) => {
  try {
    return res.json({ success: true, ...await settlement.reconcile(String(req.query.apId || ""), asId(req.params.key)) });
  } catch (error) {
    if (error instanceof SettlementError) return res.status(error.status).json({ error: error.message });
    throw error;
  }
});

router.get("/suppliers", async (_req: Request, res: Response) => {
  const [suppliers, purchaseOrders] = await Promise.all([
    db.select().from(suppliersTable),
    db.select().from(purchaseOrdersTable),
  ]);

  const result = suppliers.map((supplier) => {
    const supplierOrders = purchaseOrders.filter(
      (order) => order.supplierId === supplier.id,
    );
    const orderValue = supplierOrders.reduce(
      (total, order) => total + Number(order.totalOrderAmount),
      0,
    );

    return {
      id: supplier.id,
      name: supplier.supplierName,
      code: supplier.id.slice(0, 8).toUpperCase(),
      contact:
        supplier.contactPerson ||
        supplier.contactNumber ||
        supplier.email ||
        "No contact listed",
      contactPerson: supplier.contactPerson,
      contactNumber: supplier.contactNumber,
      email: supplier.email,
      address: supplier.address,
      paymentTerms: supplier.paymentTerms,
      orders: supplierOrders.length,
      orderValue: formatAmount(orderValue),
      status: "Active",
    };
  });

  return res.json({ success: true, suppliers: result });
});

function generateItemBatchNumber(poNumber?: string | null, sku?: string | null, index = 0): string {
  const parts = String(poNumber || "").split("-");
  const lastDigits = (parts[parts.length - 1] || "").replace(/[^0-9]/g, "");
  const allDigits = String(poNumber || "").replace(/[^0-9]/g, "");
  const poSeq = (lastDigits || allDigits.slice(-3) || "001").slice(-3).padStart(3, "0");
  const cleanSku = String(sku || `MED${String(index + 1).padStart(4, "0")}`)
    .replace(/[^A-Z0-9]/gi, "")
    .toUpperCase();
  return `BAT-${poSeq}-${cleanSku}`;
}

router.get("/purchase-orders", async (_req: Request, res: Response) => {
  const [orders, suppliers, items, products] = await Promise.all([
    db
      .select()
      .from(purchaseOrdersTable)
      .orderBy(desc(purchaseOrdersTable.updatedAt), desc(purchaseOrdersTable.createdAt), asc(purchaseOrdersTable.id)),
    db.select().from(suppliersTable),
    db.select().from(poItemsTable),
    db.select().from(productsTable),
  ]);
  const receivedQuantities = await readReceivedQuantities(db);

  const result = orders.map((order) => {
    const orderItems = items.filter((item) => item.poId === order.id);
    const matchedSupplier = suppliers.find(
      (supplier) => String(supplier.id).toLowerCase() === String(order.supplierId).toLowerCase(),
    ) || suppliers[0];
    return {
      id: order.id,
      poNumber: order.poNumber,
      supplierId: order.supplierId,
      supplier: matchedSupplier?.supplierName || "Southern Health Wholesale",
      orderDate: order.orderDate,
      status:
        order.status === "Fulfilled"
          ? "Delivered"
          : order.status === "Approved" || order.status === "Submitted"
          ? "Waiting for delivery"
          : order.status === "Draft" || order.status === "Pending"
          ? "Pending"
          : order.status,
      totalOrderAmount: formatAmount(order.totalOrderAmount),
      itemCount: orderItems.length,
      items: orderItems.map((item, idx) => {
        const prod = products.find((p) => p.id === item.productId);
        return {
          id: item.id,
          productId: item.productId,
          product: prod?.productName || "Product",
          sku: prod?.sku || `MED-${String(idx + 1).padStart(4, "0")}`,
          batchNumber: generateItemBatchNumber(order.poNumber, prod?.sku, idx),
          quantityOrdered: item.quantityOrdered,
          quantityReceived: receivedQuantities.get(`${order.id}:${item.productId}`) || 0,
          quantityRemaining: Math.max(0, item.quantityOrdered - (receivedQuantities.get(`${order.id}:${item.productId}`) || 0)),
          unitCost: formatAmount(item.unitCost),
          lineTotal: formatAmount(item.lineTotal),
        };
      }),
    };
  });

  return res.json({ success: true, purchaseOrders: result });
});

router.get(
  "/purchase-orders/:id/items",
  async (req: Request, res: Response) => {
    const poId = asId(req.params.id);
    const order = await findOrder(poId);
    if (!order) {
      return res
        .status(404)
        .json({ success: false, error: "Purchase order not found." });
    }

    const [items, products] = await Promise.all([
      db.select().from(poItemsTable).where(eq(poItemsTable.poId, order.id)),
      db.select().from(productsTable),
    ]);
    const receiving = await readOrderReceivingState(db, order.id);

    return res.json({
      success: true,
      items: items.map((item, idx) => {
        const prod = products.find((product) => product.id === item.productId);
        return {
          id: item.id,
          productId: item.productId,
          product: prod?.productName || "Unknown product",
          sku: prod?.sku || `MED-${String(idx + 1).padStart(4, "0")}`,
          batchNumber: generateItemBatchNumber(order.poNumber, prod?.sku, idx),
          quantityOrdered: item.quantityOrdered,
          quantityReceived: receiving.find(row => row.productId === item.productId)?.quantityReceived || 0,
          quantityRemaining: receiving.find(row => row.productId === item.productId)?.quantityRemaining || 0,
          unitCost: formatAmount(item.unitCost),
          lineTotal: formatAmount(item.lineTotal),
        };
      }),
    });
  },
);

const deliveryNotesMap = new Map<string, string>();
const deliveryCustomStatusMap = new Map<string, string>();

router.get("/supplier-deliveries", async (_req: Request, res: Response) => {
  const [deliveries, deliveryItems, orders, suppliers, products] =
    await Promise.all([
      db.select().from(supplierDeliveriesTable).orderBy(desc(supplierDeliveriesTable.createdAt), asc(supplierDeliveriesTable.id)),
      db.select().from(deliveryItemsTable),
      db.select().from(purchaseOrdersTable),
      db.select().from(suppliersTable),
      db.select().from(productsTable),
    ]);

  const result = deliveries.map((delivery) => {
    const order = orders.find(
      (candidate) => String(candidate.id).toLowerCase() === String(delivery.poId).toLowerCase(),
    );
    const supplier = suppliers.find(
      (candidate) => order && String(candidate.id).toLowerCase() === String(order.supplierId).toLowerCase(),
    ) || suppliers[0];

    const customStatus = deliveryCustomStatusMap.get(delivery.id) || (order ? deliveryCustomStatusMap.get(order.id) : undefined);

    return {
      id: delivery.id,
      poId: delivery.poId,
      poNumber: order?.poNumber || "Unknown PO",
      supplier: supplier?.supplierName || "Southern Health Wholesale",
      deliveryDate: delivery.deliveryDate,
      deliveryStatus: customStatus || delivery.deliveryStatus,
      isUserEditedStatus: Boolean(customStatus),
      notes: deliveryNotesMap.get(delivery.id) || (order ? deliveryNotesMap.get(order.id) : "") || "",
      items: deliveryItems
        .filter((item) => item.deliveryId === delivery.id)
        .map((item, idx) => {
          const prod = products.find((candidate) => candidate.id === item.productId);
          const autoBatch = generateItemBatchNumber(order?.poNumber, prod?.sku, idx);
          return {
            id: item.id,
            productId: item.productId,
            product: prod?.productName || "Unknown product",
            sku: prod?.sku || `MED-${String(idx + 1).padStart(4, "0")}`,
            batchNumber: item.batchNumber && /^BAT-\d+-MED/i.test(item.batchNumber) ? item.batchNumber : autoBatch,
            expirationDate: item.expirationDate,
            quantityDelivered: item.quantityDelivered,
          };
        }),
    };
  });

  return res.json({ success: true, deliveries: result });
});

router.get("/supplier-invoices", async (_req: Request, res: Response) => {
  const model=await readSupplierInvoices(queryDb);
  return res.json({success:true,invoices:model.invoices,reconciliation:model.reconciliation});
});

router.get("/supplier-deliveries/:id", async (req, res) => {
  res.set("Cache-Control", "no-store");
  const id = deliveryKey(req.params.id);
  const saved = await readDelivery(db, id);
  return res.json(saved ? { success: true, state: "committed", ...saved } : { success: true, state: "not_found" });
});

router.post("/supplier-deliveries", async (req, res) => {
  res.set("Cache-Control", "no-store");
  const id = deliveryKey(req.get("Idempotency-Key"));
  const result = await submitDelivery(id, deliveryPayload(req.body));
  return res.status(result.replayed ? 200 : 201).json({ success: true, ...result });
});

router.patch("/supplier-deliveries/:id/status", async (req, res) => {
  res.set("Cache-Control", "no-store");
  const id = asId(req.params.id);
  if (!uuidPattern.test(id)) throw new DeliveryInputError("Invalid receiving report ID.");
  const result = await completeDelivery(id.toLowerCase(), deliveryDecision(req.body));
  return res.json({ success: true, ...result });
});

router.patch("/supplier-deliveries/:id", async (req: Request, res: Response) => {
  res.set("Cache-Control", "no-store");
  const id = asId(req.params.id);
  const { poId, deliveryDate, deliveryStatus, quantityDelivered, batchNumber, notes } = req.body as any;
  try {
    const cleanId = id.replace(/^po-receiving-/, "");
    const existingList = uuidPattern.test(cleanId)
      ? await db.select().from(supplierDeliveriesTable).where(eq(supplierDeliveriesTable.id, cleanId))
      : [];
    let existing = existingList[0];
    if (!existing && (poId || uuidPattern.test(cleanId))) {
      const targetPoId = poId || cleanId;
      const byPo = await db.select().from(supplierDeliveriesTable).where(eq(supplierDeliveriesTable.poId, targetPoId));
      existing = byPo[0];
    }

    if (deliveryStatus) {
      deliveryCustomStatusMap.set(id, deliveryStatus);
      deliveryCustomStatusMap.set(cleanId, deliveryStatus);
      if (poId) deliveryCustomStatusMap.set(poId, deliveryStatus);
      if (existing) deliveryCustomStatusMap.set(existing.id, deliveryStatus);
    }
    if (notes !== undefined) {
      deliveryNotesMap.set(id, String(notes));
      deliveryNotesMap.set(cleanId, String(notes));
      if (poId) deliveryNotesMap.set(poId, String(notes));
      if (existing) deliveryNotesMap.set(existing.id, String(notes));
    }

    if (existing) {
      const updateData: any = {};
      if (deliveryDate) updateData.deliveryDate = deliveryDate;
      if (deliveryStatus) {
        let dbStatus = deliveryStatus;
        if (deliveryStatus === "Delivered" || deliveryStatus === "Successful") dbStatus = "Received";
        else if (deliveryStatus === "Lacking") dbStatus = "Partial";
        else if (deliveryStatus === "Waiting for delivery") dbStatus = "Pending";
        const allowed = ["Pending", "Received", "Partial", "Inspected", "Rejected"];
        if (allowed.includes(dbStatus)) {
          updateData.deliveryStatus = dbStatus;
        }
      }
      if (Object.keys(updateData).length > 0) {
        await db.update(supplierDeliveriesTable).set(updateData).where(eq(supplierDeliveriesTable.id, existing.id));
      }
      if (quantityDelivered !== undefined || batchNumber !== undefined) {
        const itemUpdate: any = {};
        if (quantityDelivered !== undefined && Number(quantityDelivered) > 0) itemUpdate.quantityDelivered = Number(quantityDelivered);
        if (batchNumber) itemUpdate.batchNumber = batchNumber;
        if (Object.keys(itemUpdate).length > 0) {
          await db.update(deliveryItemsTable).set(itemUpdate).where(eq(deliveryItemsTable.deliveryId, existing.id));
        }
      }
    }

    return res.json({ success: true, message: "Receiving report updated." });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || "Failed to update receiving report." });
  }
});

router.post("/purchase-orders/:id/mark-successful", async (req: Request, res: Response) => {
  res.set("Cache-Control", "no-store");
  const rawId = asId(req.params.id).replace(/^po-receiving-/, "");
  const { poNumber, deliveryDate, batchNumber, expirationDate, notes } = req.body as any;
  try {
    const order = (await findOrder(rawId)) || (poNumber ? await findOrder(poNumber) : null);
    if (!order) {
      return res.status(404).json({ success: false, error: "Purchase order not found." });
    }

    const poItems = await db.select().from(poItemsTable).where(eq(poItemsTable.poId, order.id));
    const existingDeliveries = await db.select().from(supplierDeliveriesTable).where(eq(supplierDeliveriesTable.poId, order.id));
    const effectiveDate = deliveryDate || pharmacyDate();
    const cleanPo = order.poNumber.replace(/^PO-/, "").replace(/[^0-9A-Z]/gi, "");
    const effectiveBatch = (batchNumber ? String(batchNumber).trim().toUpperCase() : `BAT-${cleanPo.slice(-6).toUpperCase()}`);
    const effectiveExpiry = expirationDate && expirationDate !== "N/A" && expirationDate !== "—" ? String(expirationDate) : "2028-12-31";

    await db.transaction(async (tx) => {
      let delivery = existingDeliveries[0];
      if (!delivery) {
        const [created] = await tx
          .insert(supplierDeliveriesTable)
          .values({
            poId: order.id,
            deliveryDate: effectiveDate,
            deliveryStatus: "Received",
          })
          .returning();
        delivery = created;
      } else {
        await tx
          .update(supplierDeliveriesTable)
          .set({ deliveryStatus: "Received", deliveryDate: effectiveDate })
          .where(eq(supplierDeliveriesTable.id, delivery.id));
      }

      const existingMovements = await tx
        .select()
        .from(stockMovementsTable)
        .where(and(eq(stockMovementsTable.referenceId, delivery.id), eq(stockMovementsTable.movementType, "StockIn")));

      if (existingMovements.length === 0) {
        const existingDelivItems = await tx
          .select()
          .from(deliveryItemsTable)
          .where(eq(deliveryItemsTable.deliveryId, delivery.id));

        for (let idx = 0; idx < poItems.length; idx++) {
          const poItem = poItems[idx]!;
          const [product] = await tx
            .select()
            .from(productsTable)
            .where(eq(productsTable.id, poItem.productId));
          if (!product) continue;

          const delivItem = existingDelivItems.find((di) => di.productId === poItem.productId);
          const qtyToAdd = delivItem ? delivItem.quantityDelivered : poItem.quantityOrdered;
          const itemBatch = generateItemBatchNumber(order.poNumber, product.sku, idx);
          const itemExpiry = delivItem?.expirationDate || effectiveExpiry;

          if (!delivItem) {
            await tx.insert(deliveryItemsTable).values({
              deliveryId: delivery.id,
              productId: poItem.productId,
              batchNumber: itemBatch,
              expirationDate: itemExpiry,
              quantityDelivered: qtyToAdd,
            });
          }

          const allProductBatches = await tx
            .select()
            .from(batchInfoTable)
            .where(eq(batchInfoTable.productId, poItem.productId));
          const physicalStock = allProductBatches.reduce((sum, b) => sum + b.quantityRemaining, 0);
          const matchingBatch = allProductBatches.find(
            (b) => b.batchNumber.trim().toUpperCase() === itemBatch.trim().toUpperCase(),
          );

          const [savedBatch] = matchingBatch
            ? await tx
                .update(batchInfoTable)
                .set({
                  quantityRemaining: matchingBatch.quantityRemaining + qtyToAdd,
                  updatedAt: new Date(),
                })
                .where(eq(batchInfoTable.id, matchingBatch.id))
                .returning()
            : await tx
                .insert(batchInfoTable)
                .values({
                  productId: poItem.productId,
                  batchNumber: itemBatch,
                  expirationDate: itemExpiry,
                  quantityRemaining: qtyToAdd,
                  dateReceived: effectiveDate,
                })
                .returning();

          await tx
            .update(productsTable)
            .set({
              currentStock: physicalStock + qtyToAdd,
              updatedAt: new Date(),
            })
            .where(eq(productsTable.id, poItem.productId));

          await tx.insert(stockMovementsTable).values({
            productId: poItem.productId,
            batchId: savedBatch.id,
            referenceId: delivery.id,
            movementType: "StockIn",
            quantity: qtyToAdd,
            notes: `Successful purchase (${order.poNumber})`,
          });
        }
      }

      await tx
        .update(purchaseOrdersTable)
        .set({ status: "Fulfilled", updatedAt: new Date() })
        .where(eq(purchaseOrdersTable.id, order.id));

      deliveryCustomStatusMap.set(order.id, "Successful");
      deliveryCustomStatusMap.set(delivery.id, "Successful");
      if (notes) {
        deliveryNotesMap.set(order.id, String(notes));
        deliveryNotesMap.set(delivery.id, String(notes));
      }
    });

    return res.json({ success: true, status: "Successful" });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || "Failed to mark purchase order as successful." });
  }
});

router.post(
  "/supplier-invoices",
  requireRoles("Admin", "FrontDesk"),
  async (req: Request, res: Response) => {
    const { supplierId, poId, invoiceNumber, dueDate, invoiceAmount, isPaid } =
      req.body as {
        supplierId?: string;
        poId?: string | null;
        invoiceNumber?: string;
        dueDate?: string;
        invoiceAmount?: number | string;
        isPaid?: boolean;
      };
    if (!supplierId || typeof invoiceNumber !== 'string' || !invoiceNumber.trim() || !dueDate) {
      return res.status(400).json({
        success: false,
        error: "Supplier, invoice number, and due date are required.",
      });
    }
    if (isPaid) return res.status(400).json({ error: "Create the invoice unpaid, then use Record payment to settle it." });
    if (invoiceNumber.trim().length > 100) return res.status(400).json({ error: "Invoice number must be 100 characters or fewer." });
    const supplier = await findSupplier(supplierId);
    if (!supplier)
      return res
        .status(400)
        .json({ success: false, error: "Supplier not found." });
    if (!/^[A-Za-z0-9-]+$/.test(invoiceNumber.trim()))
      return res.status(400).json({
        error:
          "Invoice numbers may contain only letters, numbers, and hyphens.",
      });
    if (Number.isNaN(new Date(`${dueDate}T00:00:00`).getTime()))
      return res.status(400).json({ error: "Enter a valid due date." });

    let resolvedPoId: string | null = null;
    let resolvedPoNumber: string | null = null;
    if (poId) {
      const order = await findOrder(poId);
      if (!order) return res.status(400).json({ error: "The selected purchase order no longer exists. Choose another purchase order." });
      if (order.supplierId !== supplier.id) return res.status(400).json({ error: "The selected purchase order belongs to a different supplier. Choose a purchase order for this supplier." });
      resolvedPoId = order.id;
      resolvedPoNumber = order.poNumber;
    }

    const amount = Number(invoiceAmount);
    if (!Number.isFinite(amount) || amount <= 0)
      return res
        .status(400)
        .json({ error: "Invoice amount must be greater than zero." });
    const invoice = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(supplierInvoicesTable)
        .values({
          supplierId: supplier.id,
          poId: resolvedPoId,
          invoiceNumber: invoiceNumber.trim().toUpperCase(),
          dueDate,
          invoiceAmount: formatAmount(amount),
          isPaid: Boolean(isPaid),
        })
        .returning();
      await tx.insert(accountsPayableTable).values({
        supplierId: supplier.id,
        invoiceId: created.id,
        totalOwed: formatAmount(amount),
        totalPaid: Boolean(isPaid) ? formatAmount(amount) : "0.00",
        balance: Boolean(isPaid) ? "0.00" : formatAmount(amount),
        lastPaymentDate: Boolean(isPaid)
          ? new Date().toISOString().slice(0, 10)
          : null,
      });
      return created;
    }).catch(error => {
      if (!identifierConflict(error, ['supplier_invoices_invoice_number_key','uq_supplier_invoices_supplier_number_ci'])) throw error;
      res.status(409).json({ success: false, error: "This invoice number already exists for this supplier.", errors: { invoiceNumber: "Use a different invoice number for this supplier." } });
      return null;
    });
    if (!invoice) return;

    return res.status(201).json({
      success: true,
      invoice: {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        supplierId: invoice.supplierId,
        supplier: supplier.supplierName,
        poId: invoice.poId,
        poNumber: resolvedPoNumber,
        dueDate: invoice.dueDate,
        invoiceAmount: formatAmount(invoice.invoiceAmount),
        isPaid: invoice.isPaid,
        status: invoice.isPaid ? "Paid" : "Unpaid",
      },
    });
  },
);

router.post(
  "/purchase-orders",
  requireRoles("Admin", "FrontDesk"),
  async (req: Request, res: Response) => {
    const { supplierId, poNumber, status, items } = req.body as {
      supplierId?: string;
      poNumber?: string;
      status?: string;
      items?: Array<{
        productId?: string;
        quantityOrdered?: number | string;
        unitCost?: number | string;
      }>;
    };

    if (!supplierId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Supplier and at least one line item are required.",
      });
    }

    const supplier = await findSupplier(supplierId);
    if (!supplier) {
      return res
        .status(400)
        .json({ success: false, error: "Supplier not found." });
    }
    if (poNumber !== undefined && typeof poNumber !== "string") {
      return res.status(400).json({ error: "Enter a valid PO number or leave it blank to generate one." });
    }
    const manualPoNumber = poNumber?.trim() || "";
    if (manualPoNumber && !/^[A-Za-z0-9-]{1,100}$/.test(manualPoNumber)) {
      return res.status(400).json({
        success: false,
        error: "PO numbers must be at most 100 letters, numbers, or hyphens.",
      });
    }

    const resolvedItems: Array<{
      productId: string;
      quantityOrdered: number;
      unitCost: number;
    }> = [];
    for (const item of items) {
      const prod = await findProduct(item.productId || "");
      if (!prod) return res.status(400).json({ error: "Choose a valid product for every line item." });
      if (resolvedItems.some((line) => line.productId === prod.id))
        return res.status(409).json({ error: `${prod.productName} (${prod.sku}) is already listed. Edit the quantity on its existing line.` });
      if (!Number.isInteger(Number(item.quantityOrdered)) || Number(item.quantityOrdered) <= 0 ||
          !Number.isFinite(Number(item.unitCost)) || Number(item.unitCost) < 0)
        return res.status(400).json({ error: "Each line needs a positive whole quantity and a valid unit cost." });
      const qty = Math.max(1, Math.floor(Number(item.quantityOrdered) || 1));
      const cost = Math.max(0, Number(item.unitCost) || 0);
      resolvedItems.push({
        productId: prod.id,
        quantityOrdered: qty,
        unitCost: cost,
      });
    }

    if (resolvedItems.length === 0) {
      return res
        .status(400)
        .json({ success: false, error: "No valid product items provided." });
    }

    const totalOrderAmount = resolvedItems.reduce(
      (total, item) => total + item.quantityOrdered * item.unitCost,
      0,
    );
    const saveOrder = (number: string) => db.transaction(async (tx) => {
      const [order] = await tx
        .insert(purchaseOrdersTable)
        .values({
          supplierId: supplier.id,
          poNumber: number,
          status: (status && poStatuses.includes(status as any)
            ? status
            : "Draft") as any,
          totalOrderAmount: formatAmount(totalOrderAmount),
        })
        .returning();

      const createdItems = await tx
        .insert(poItemsTable)
        .values(
          resolvedItems.map((item) => ({
            poId: order.id,
            productId: item.productId,
            quantityOrdered: item.quantityOrdered,
            unitCost: formatAmount(item.unitCost),
            lineTotal: formatAmount(item.quantityOrdered * item.unitCost),
          })),
        )
        .returning();

      return { order, items: createdItems };
    });

    let result: Awaited<ReturnType<typeof saveOrder>> | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      const number = manualPoNumber || `PO-${pharmacyDate().replaceAll("-", "")}-${randomUUID()}`;
      try {
        result = await saveOrder(number);
        break;
      } catch (error) {
        if (!identifierConflict(error, ["purchase_orders_po_number_key"])) throw error;
        if (manualPoNumber) return res.status(409).json({
          success: false,
          error: "This PO number already exists. Enter a different PO number or leave it blank to generate one.",
          errors: { poNumber: "Use a different PO number." },
        });
      }
    }
    if (!result) return res.status(503).json({ error: "Could not generate a unique PO number. Please try again." });

    return res.status(201).json({
      success: true,
      purchaseOrder: result.order,
      items: result.items,
    });
  },
);

router.patch(
  "/purchase-orders/:id/items",
  requireRoles("Admin", "FrontDesk"),
  async (req: Request, res: Response) => {
    const poId = asId(req.params.id);
    const { items } = req.body as { items?: Array<{ id?: string; quantityOrdered?: number | string; unitCost?: number | string }> };
    if (!Array.isArray(items) || items.length === 0)
      return res.status(400).json({ success: false, error: "No items to update." });
    const order = await findOrder(poId);
    if (!order) return res.status(404).json({ success: false, error: "Purchase order not found." });
    if (["Fulfilled", "Cancelled"].includes(order.status))
      return res.status(409).json({ success: false, error: "Closed purchase orders cannot be edited." });
    for (const item of items) {
      if (!item.id || !Number.isInteger(Number(item.quantityOrdered)) || Number(item.quantityOrdered) <= 0 ||
          !Number.isFinite(Number(item.unitCost)) || Number(item.unitCost) < 0)
        return res.status(400).json({ success: false, error: "Each item needs a positive whole quantity and a valid unit cost." });
    }
    const total = await db.transaction(async (tx) => {
      const existing = await tx.select().from(poItemsTable).where(eq(poItemsTable.poId, order.id));
      for (const edit of items) {
        const row = existing.find((r) => r.id === edit.id);
        if (!row) continue;
        const qty = Number(edit.quantityOrdered);
        const cost = Number(edit.unitCost);
        await tx.update(poItemsTable)
          .set({ quantityOrdered: qty, unitCost: formatAmount(cost), lineTotal: formatAmount(qty * cost) })
          .where(eq(poItemsTable.id, row.id));
      }
      const fresh = await tx.select().from(poItemsTable).where(eq(poItemsTable.poId, order.id));
      const sum = fresh.reduce((acc, r) => acc + Number(r.lineTotal), 0);
      await tx.update(purchaseOrdersTable)
        .set({ totalOrderAmount: formatAmount(sum), updatedAt: new Date() })
        .where(eq(purchaseOrdersTable.id, order.id));
      return sum;
    });
    return res.json({ success: true, totalOrderAmount: formatAmount(total) });
  },
);

router.patch(
  "/purchase-orders/:id/status",
  requireRoles("Admin", "FrontDesk"),
  async (req: Request, res: Response) => {
    const poId = asId(req.params.id);
    let { status } = req.body as { status?: string };

    if (status === "Waiting for delivery") status = "Submitted";
    else if (status === "Delivered") status = "Fulfilled";
    else if (status === "Rejected") status = "Cancelled";
    else if (status === "Pending") status = "Pending";

    if (
      !status ||
      !poStatuses.includes(status as (typeof poStatuses)[number])
    ) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Use one of: Pending, Waiting for delivery, Delivered, Cancelled.`,
      });
    }

    const [existing] = await db
      .select()
      .from(purchaseOrdersTable)
      .where(
        or(
          eq(purchaseOrdersTable.id, poId),
          eq(purchaseOrdersTable.poNumber, poId),
        ),
      );

    if (!existing) {
      return res.status(404).json({ error: "Purchase order not found." });
    }

    const updated = await db.transaction(async (tx) => {
      const [order] = await tx.select().from(purchaseOrdersTable)
        .where(eq(purchaseOrdersTable.id, existing.id)).for("update");
      if (!order) throw new ReceivingError("Purchase order no longer exists. Refresh the order list.");
      if (order.status === status) return order;
      const [saved] = await tx.update(purchaseOrdersTable)
        .set({status: status as (typeof poStatuses)[number], updatedAt: new Date()})
        .where(eq(purchaseOrdersTable.id, order.id)).returning();

      if (status === "Fulfilled") {
        const existingDelivs = await tx.select().from(supplierDeliveriesTable).where(eq(supplierDeliveriesTable.poId, order.id));
        if (existingDelivs.length === 0) {
          const [createdDeliv] = await tx
            .insert(supplierDeliveriesTable)
            .values({
              poId: order.id,
              deliveryDate: pharmacyDate(),
              deliveryStatus: "Received",
            })
            .returning();
          const poItems = await tx.select().from(poItemsTable).where(eq(poItemsTable.poId, order.id));
          const allProducts = await tx.select().from(productsTable);
          for (let idx = 0; idx < poItems.length; idx++) {
            const poItem = poItems[idx]!;
            const prod = allProducts.find((p) => p.id === poItem.productId);
            await tx.insert(deliveryItemsTable).values({
              deliveryId: createdDeliv.id,
              productId: poItem.productId,
              batchNumber: generateItemBatchNumber(order.poNumber, prod?.sku, idx),
              expirationDate: "2028-12-31",
              quantityDelivered: poItem.quantityOrdered,
            });
          }
        } else {
          await tx
            .update(supplierDeliveriesTable)
            .set({ deliveryStatus: "Received" })
            .where(eq(supplierDeliveriesTable.id, existingDelivs[0]!.id));
        }
      }
      return saved;
    });

    return res.json({ success: true, purchaseOrder: updated });
  },
);

router.patch("/supplier-invoices/:id/status", async (req: Request, res: Response) => {
  const id = asId(req.params.id);
  if (!uuidPattern.test(id)) return res.status(400).json({ error: "Invalid invoice ID." });
  const [invoice] = await db.select().from(supplierInvoicesTable).where(eq(supplierInvoicesTable.id, id));
  if (!invoice) return res.status(404).json({ error: "Invoice not found." });
  return res.status(409).json({ error: "Use Record payment to settle this invoice. Status cannot be changed independently of payment history." });
});

router.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (error instanceof ReceivingError || error instanceof DeliveryInputError || error instanceof DeliveryNotFoundError)
    return res.status(error.status).json({success: false, error: error.message, ...(error instanceof DeliveryReferenceConflict ? {code: error.code} : {})});
  return next(error);
});

export default router;
