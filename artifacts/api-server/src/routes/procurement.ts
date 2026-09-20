import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import {
  db,
  poItemsTable,
  productsTable,
  purchaseOrdersTable,
  supplierDeliveriesTable,
  deliveryItemsTable,
  supplierInvoicesTable,
  suppliersTable,
} from "@workspace/db";
import { requireAuth } from "../middleware/auth";

const router: IRouter = Router();
const poStatuses = purchaseOrdersTable.status.enumValues;

function asId(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] : (value ?? "");
}

function formatAmount(value: string | number): string {
  return Number(value).toFixed(2);
}

router.use(requireAuth);

router.get("/suppliers", async (_req: Request, res: Response) => {
  const [suppliers, purchaseOrders] = await Promise.all([
    db.select().from(suppliersTable),
    db.select().from(purchaseOrdersTable),
  ]);

  const result = suppliers.map((supplier) => {
    const supplierOrders = purchaseOrders.filter((order) => order.supplierId === supplier.id);
    const orderValue = supplierOrders.reduce(
      (total, order) => total + Number(order.totalOrderAmount),
      0,
    );

    return {
      id: supplier.id,
      name: supplier.supplierName,
      code: supplier.id.slice(0, 8).toUpperCase(),
      contact: supplier.contactPerson || supplier.contactNumber || supplier.email || "No contact listed",
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
  const [orders, suppliers, items] = await Promise.all([
    db.select().from(purchaseOrdersTable).orderBy(desc(purchaseOrdersTable.orderDate)),
    db.select().from(suppliersTable),
    db.select().from(poItemsTable),
  ]);

  const result = orders.map((order) => ({
    id: order.id,
    poNumber: order.poNumber,
    supplierId: order.supplierId,
    supplier: suppliers.find((supplier) => supplier.id === order.supplierId)?.supplierName || "Unknown supplier",
    orderDate: order.orderDate,
    status: order.status,
    totalOrderAmount: formatAmount(order.totalOrderAmount),
    itemCount: items.filter((item) => item.poId === order.id).length,
  }));

  return res.json({ success: true, purchaseOrders: result });
});

router.get("/purchase-orders/:id/items", async (req: Request, res: Response) => {
  const poId = asId(req.params.id);
  const [order] = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, poId));
  if (!order) {
    return res.status(404).json({ success: false, error: "Purchase order not found." });
  }

  const [items, products] = await Promise.all([
    db.select().from(poItemsTable).where(eq(poItemsTable.poId, poId)),
    db.select().from(productsTable),
  ]);

  return res.json({
    success: true,
    items: items.map((item) => ({
      id: item.id,
      productId: item.productId,
      product: products.find((product) => product.id === item.productId)?.productName || "Unknown product",
      sku: products.find((product) => product.id === item.productId)?.sku || "",
      quantityOrdered: item.quantityOrdered,
      unitCost: formatAmount(item.unitCost),
      lineTotal: formatAmount(item.lineTotal),
    })),
  });
});

router.get("/supplier-deliveries", async (_req: Request, res: Response) => {
  const [deliveries, deliveryItems, orders, suppliers, products] = await Promise.all([
    db.select().from(supplierDeliveriesTable),
    db.select().from(deliveryItemsTable),
    db.select().from(purchaseOrdersTable),
    db.select().from(suppliersTable),
    db.select().from(productsTable),
  ]);

  const result = deliveries.map((delivery) => {
    const order = orders.find((candidate) => candidate.id === delivery.poId);
    const supplier = suppliers.find((candidate) => candidate.id === order?.supplierId);

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
          product: products.find((candidate) => candidate.id === item.productId)?.productName || "Unknown product",
          sku: products.find((candidate) => candidate.id === item.productId)?.sku || "",
          batchNumber: item.batchNumber,
          expirationDate: item.expirationDate,
          quantityDelivered: item.quantityDelivered,
        })),
    };
  });

  return res.json({ success: true, deliveries: result });
});

router.get("/supplier-invoices", async (_req: Request, res: Response) => {
  const [invoices, suppliers, orders] = await Promise.all([
    db.select().from(supplierInvoicesTable),
    db.select().from(suppliersTable),
    db.select().from(purchaseOrdersTable),
  ]);

  const result = invoices.map((invoice) => ({
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    supplierId: invoice.supplierId,
    supplier: suppliers.find((supplier) => supplier.id === invoice.supplierId)?.supplierName || "Unknown supplier",
    poId: invoice.poId,
    poNumber: orders.find((order) => order.id === invoice.poId)?.poNumber || null,
    dueDate: invoice.dueDate,
    invoiceAmount: formatAmount(invoice.invoiceAmount),
    isPaid: invoice.isPaid,
    status: invoice.isPaid ? "Paid" : "Unpaid",
  }));

  return res.json({ success: true, invoices: result });
});

router.post("/supplier-deliveries", async (req: Request, res: Response) => {
  const { poId, deliveryDate, deliveryStatus, items } = req.body as {
    poId?: string;
    deliveryDate?: string;
    deliveryStatus?: string;
    items?: Array<{ productId?: string; batchNumber?: string; expirationDate?: string; quantityDelivered?: number | string }>;
  };
  const validStatuses = supplierDeliveriesTable.deliveryStatus.enumValues;

  if (!poId || !Array.isArray(items) || items.length === 0 || (deliveryStatus && !validStatuses.includes(deliveryStatus as (typeof validStatuses)[number]))) {
    return res.status(400).json({ success: false, error: "Purchase order, valid delivery status, and at least one item are required." });
  }
  const [order] = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, poId));
  if (!order) return res.status(400).json({ success: false, error: "Purchase order not found." });

  const normalizedItems = items.map((item) => ({
    productId: item.productId || "",
    batchNumber: String(item.batchNumber || "").trim(),
    expirationDate: String(item.expirationDate || ""),
    quantityDelivered: Number(item.quantityDelivered),
  }));
  if (normalizedItems.some((item) => !item.productId || !item.batchNumber || !/^\d{4}-\d{2}-\d{2}$/.test(item.expirationDate) || !Number.isInteger(item.quantityDelivered) || item.quantityDelivered <= 0)) {
    return res.status(400).json({ success: false, error: "Each delivery item needs a product, batch, valid expiry date, and positive whole quantity." });
  }
  const products = await db.select().from(productsTable);
  if (normalizedItems.some((item) => !products.some((product) => product.id === item.productId))) {
    return res.status(400).json({ success: false, error: "One or more delivery products were not found." });
  }

  const result = await db.transaction(async (tx) => {
    const [delivery] = await tx.insert(supplierDeliveriesTable).values({
      poId,
      deliveryDate: deliveryDate ? new Date(deliveryDate) : new Date(),
      deliveryStatus: (deliveryStatus || "Received") as (typeof validStatuses)[number],
    }).returning();
    const createdItems = await tx.insert(deliveryItemsTable).values(normalizedItems.map((item) => ({
      deliveryId: delivery.id,
      productId: item.productId,
      batchNumber: item.batchNumber,
      expirationDate: item.expirationDate,
      quantityDelivered: item.quantityDelivered,
    }))).returning();
    return { delivery, items: createdItems };
  });
  return res.status(201).json({ success: true, delivery: result.delivery, items: result.items });
});

router.post("/supplier-invoices", async (req: Request, res: Response) => {
  const { supplierId, poId, invoiceNumber, dueDate, invoiceAmount, isPaid } = req.body as {
    supplierId?: string; poId?: string | null; invoiceNumber?: string; dueDate?: string; invoiceAmount?: number | string; isPaid?: boolean;
  };
  if (!supplierId || !invoiceNumber?.trim() || !dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || !Number.isFinite(Number(invoiceAmount)) || Number(invoiceAmount) < 0) {
    return res.status(400).json({ success: false, error: "Supplier, invoice number, due date, and non-negative amount are required." });
  }
  const [supplier] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, supplierId));
  if (!supplier) return res.status(400).json({ success: false, error: "Supplier not found." });
  if (poId) {
    const [order] = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, poId));
    if (!order) return res.status(400).json({ success: false, error: "Purchase order not found." });
    if (order.supplierId !== supplierId) return res.status(400).json({ success: false, error: "Purchase order does not belong to this supplier." });
  }
  const [invoice] = await db.insert(supplierInvoicesTable).values({
    supplierId, poId: poId || null, invoiceNumber: invoiceNumber.trim(), dueDate,
    invoiceAmount: formatAmount(Number(invoiceAmount)), isPaid: Boolean(isPaid),
  }).returning();
  return res.status(201).json({ success: true, invoice });
});

router.patch("/supplier-invoices/:id/status", async (req: Request, res: Response) => {
  const invoiceId = asId(req.params.id);
  const { status } = req.body as { status?: string };
  if (status !== "Paid" && status !== "Unpaid") return res.status(400).json({ success: false, error: "Invoice status must be Paid or Unpaid." });
  const [existing] = await db.select().from(supplierInvoicesTable).where(eq(supplierInvoicesTable.id, invoiceId));
  if (!existing) return res.status(404).json({ success: false, error: "Invoice not found." });
  const [invoice] = await db.update(supplierInvoicesTable).set({ isPaid: status === "Paid" }).where(eq(supplierInvoicesTable.id, invoiceId)).returning();
  return res.json({ success: true, invoice });
});

router.post("/purchase-orders", async (req: Request, res: Response) => {
  const { supplierId, poNumber, items } = req.body as {
    supplierId?: string;
    poNumber?: string;
    items?: Array<{ productId?: string; quantityOrdered?: number | string; unitCost?: number | string }>;
  };

  if (!supplierId || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, error: "Supplier and at least one line item are required." });
  }

  const supplier = await db.select().from(suppliersTable).where(eq(suppliersTable.id, supplierId));
  if (supplier.length === 0) {
    return res.status(400).json({ success: false, error: "Supplier not found." });
  }

  const normalizedItems = items.map((item) => ({
    productId: item.productId || "",
    quantityOrdered: Number(item.quantityOrdered),
    unitCost: Number(item.unitCost),
  }));

  if (normalizedItems.some((item) => !item.productId || !Number.isInteger(item.quantityOrdered) || item.quantityOrdered <= 0 || !Number.isFinite(item.unitCost) || item.unitCost < 0)) {
    return res.status(400).json({ success: false, error: "Each item needs a product, positive whole quantity, and non-negative unit cost." });
  }

  const products = await db.select().from(productsTable);
  if (normalizedItems.some((item) => !products.some((product) => product.id === item.productId))) {
    return res.status(400).json({ success: false, error: "One or more products were not found." });
  }

  const totalOrderAmount = normalizedItems.reduce(
    (total, item) => total + item.quantityOrdered * item.unitCost,
    0,
  );
  const generatedPoNumber = `PO-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-${Math.floor(100 + Math.random() * 900)}`;

  const result = await db.transaction(async (tx) => {
    const [order] = await tx
      .insert(purchaseOrdersTable)
      .values({
        supplierId,
        poNumber: poNumber?.trim() || generatedPoNumber,
        totalOrderAmount: formatAmount(totalOrderAmount),
      })
      .returning();

    const createdItems = await tx
      .insert(poItemsTable)
      .values(normalizedItems.map((item) => ({
        poId: order.id,
        productId: item.productId,
        quantityOrdered: item.quantityOrdered,
        unitCost: formatAmount(item.unitCost),
        lineTotal: formatAmount(item.quantityOrdered * item.unitCost),
      })))
      .returning();

    return { order, items: createdItems };
  });

  return res.status(201).json({ success: true, purchaseOrder: result.order, items: result.items });
});

router.patch("/purchase-orders/:id/status", async (req: Request, res: Response) => {
  const poId = asId(req.params.id);
  const { status } = req.body as { status?: string };

  if (!status || !poStatuses.includes(status as (typeof poStatuses)[number])) {
    return res.status(400).json({ success: false, error: `Invalid status. Use one of: ${poStatuses.join(", ")}.` });
  }

  const [existing] = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, poId));
  if (!existing) {
    return res.status(404).json({ success: false, error: "Purchase order not found." });
  }

  const [updated] = await db
    .update(purchaseOrdersTable)
    .set({ status: status as (typeof poStatuses)[number], updatedAt: new Date() })
    .where(and(eq(purchaseOrdersTable.id, poId)))
    .returning();

  return res.json({ success: true, purchaseOrder: updated });
});

export default router;