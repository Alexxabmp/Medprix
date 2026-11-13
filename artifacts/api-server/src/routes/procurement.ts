import { deliveryKey, deliveryPayload, readDelivery, submitDelivery, DeliveryInputError, DeliveryReferenceConflict } from "../lib/supplier-delivery-submissions";
import { randomUUID } from "node:crypto";
import { pharmacyDate } from "@workspace/api-zod";
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { asc, desc, eq, ilike, or } from "drizzle-orm";
import {
  db,
  queryDb,
  poItemsTable,
  productsTable,
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
          paymentTerms: terms || null,
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
    return {
      id: order.id,
      poNumber: order.poNumber,
      supplierId: order.supplierId,
      supplier:
        suppliers.find((supplier) => supplier.id === order.supplierId)
          ?.supplierName || "Unknown supplier",
      orderDate: order.orderDate,
      status: order.status,
      totalOrderAmount: formatAmount(order.totalOrderAmount),
      itemCount: orderItems.length,
      items: orderItems.map((item) => ({
        id: item.id,
        productId: item.productId,
        product:
          products.find((p) => p.id === item.productId)?.productName ||
          "Product",
        sku: products.find((p) => p.id === item.productId)?.sku || "",
        quantityOrdered: item.quantityOrdered,
        quantityReceived: receivedQuantities.get(`${order.id}:${item.productId}`) || 0,
        quantityRemaining: Math.max(0, item.quantityOrdered - (receivedQuantities.get(`${order.id}:${item.productId}`) || 0)),
        unitCost: formatAmount(item.unitCost),
        lineTotal: formatAmount(item.lineTotal),
      })),
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
      items: items.map((item) => ({
        id: item.id,
        productId: item.productId,
        product:
          products.find((product) => product.id === item.productId)
            ?.productName || "Unknown product",
        sku:
          products.find((product) => product.id === item.productId)?.sku || "",
        quantityOrdered: item.quantityOrdered,
        quantityReceived: receiving.find(row => row.productId === item.productId)?.quantityReceived || 0,
        quantityRemaining: receiving.find(row => row.productId === item.productId)?.quantityRemaining || 0,
        unitCost: formatAmount(item.unitCost),
        lineTotal: formatAmount(item.lineTotal),
      })),
    });
  },
);

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
    const order = orders.find((candidate) => candidate.id === delivery.poId);
    const supplier = suppliers.find(
      (candidate) => candidate.id === order?.supplierId,
    );

    return {
      id: delivery.id,
      poId: delivery.poId,
      poNumber: order?.poNumber || "Unknown PO",
      supplier: supplier?.supplierName || "Unknown supplier",
      deliveryDate: delivery.deliveryDate,
      deliveryStatus: delivery.deliveryStatus,
      items: deliveryItems
        .filter((item) => item.deliveryId === delivery.id)
        .map((item) => ({
          id: item.id,
          productId: item.productId,
          product:
            products.find((candidate) => candidate.id === item.productId)
              ?.productName || "Unknown product",
          sku:
            products.find((candidate) => candidate.id === item.productId)
              ?.sku || "",
          batchNumber: item.batchNumber,
          expirationDate: item.expirationDate,
          quantityDelivered: item.quantityDelivered,
        })),
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
      if (order) {
        resolvedPoId = order.id;
        resolvedPoNumber = order.poNumber;
      }
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
  "/purchase-orders/:id/status",
  requireRoles("Admin", "FrontDesk"),
  async (req: Request, res: Response) => {
    const poId = asId(req.params.id);
    const { status } = req.body as { status?: string };

    if (
      !status ||
      !poStatuses.includes(status as (typeof poStatuses)[number])
    ) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Use one of: ${poStatuses.join(", ")}.`,
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
      if (["Fulfilled", "Cancelled"].includes(order.status))
        throw new ReceivingError("Closed purchase orders cannot be reopened or cancelled through a status change. Recorded receipts must be retained.");
      const receiving = await readOrderReceivingState(tx, order.id);
      if (status === "Cancelled" && receiving.some(item => item.quantityReceived > 0))
        throw new ReceivingError("This purchase order already has received stock. Use a reviewed return or correction; changing status cannot undo receiving.");
      if (status === "Fulfilled" && (!receiving.length || receiving.some(item => item.quantityRemaining > 0)))
        throw new ReceivingError("Record the outstanding products in Receiving Report Management with their actual batch and expiration dates. The order becomes Fulfilled when all quantities are received.");
      const [saved] = await tx.update(purchaseOrdersTable)
        .set({status: status as (typeof poStatuses)[number], updatedAt: new Date()})
        .where(eq(purchaseOrdersTable.id, order.id)).returning();
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
  if (error instanceof ReceivingError || error instanceof DeliveryInputError)
    return res.status(error.status).json({success: false, error: error.message, ...(error instanceof DeliveryReferenceConflict ? {code: error.code} : {})});
  return next(error);
});

export default router;
