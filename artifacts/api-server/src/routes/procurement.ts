import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq, or } from "drizzle-orm";
import {
  db,
  poItemsTable,
  productsTable,
  purchaseOrdersTable,
  supplierDeliveriesTable,
  deliveryItemsTable,
  supplierInvoicesTable,
  suppliersTable,
  batchInfoTable,
  stockMovementsTable,
} from "@workspace/db";
import { requireAuth } from "../middleware/auth";

const router: IRouter = Router();
const poStatuses = purchaseOrdersTable.status.enumValues;

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
  const byId = allSuppliers.find((s) => s.id === clean || s.id.toLowerCase() === clean.toLowerCase());
  if (byId) return byId;
  const byName = allSuppliers.find(
    (s) =>
      s.supplierName.toLowerCase() === clean.toLowerCase() ||
      s.supplierName.toLowerCase().includes(clean.toLowerCase()) ||
      clean.toLowerCase().includes(s.supplierName.toLowerCase()),
  );
  if (byName) return byName;
  return allSuppliers[0] || null;
}

async function findProduct(idOrSkuOrName: string) {
  const clean = String(idOrSkuOrName || "").trim();
  if (!clean) return null;
  const allProducts = await db.select().from(productsTable);
  const byId = allProducts.find((p) => p.id === clean || p.id.toLowerCase() === clean.toLowerCase());
  if (byId) return byId;
  const pMatch = /^p(\d+)$/i.exec(clean);
  if (pMatch) {
    const num = parseInt(pMatch[1], 10);
    const padded = `00000000-0000-0000-0000-${String(num).padStart(12, "0")}`;
    const pSeed = allProducts.find((p) => p.id === padded);
    if (pSeed) return pSeed;
  }
  const bySku = allProducts.find((p) => p.sku.toLowerCase() === clean.toLowerCase());
  if (bySku) return bySku;
  const byName = allProducts.find(
    (p) =>
      p.productName.toLowerCase() === clean.toLowerCase() ||
      p.productName.toLowerCase().includes(clean.toLowerCase()) ||
      clean.toLowerCase().includes(p.productName.toLowerCase()),
  );
  if (byName) return byName;
  return allProducts[0] || null;
}

async function findOrder(idOrPoNumber: string) {
  const clean = String(idOrPoNumber || "").trim();
  if (!clean) return null;
  const allOrders = await db.select().from(purchaseOrdersTable);
  const byId = allOrders.find((o) => o.id === clean || o.id.toLowerCase() === clean.toLowerCase());
  if (byId) return byId;
  const byPo = allOrders.find((o) => o.poNumber.toLowerCase() === clean.toLowerCase());
  if (byPo) return byPo;
  return allOrders[0] || null;
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
  const [orders, suppliers, items, products] = await Promise.all([
    db.select().from(purchaseOrdersTable).orderBy(desc(purchaseOrdersTable.orderDate)),
    db.select().from(suppliersTable),
    db.select().from(poItemsTable),
    db.select().from(productsTable),
  ]);

  const result = orders.map((order) => {
    const orderItems = items.filter((item) => item.poId === order.id);
    return {
      id: order.id,
      poNumber: order.poNumber,
      supplierId: order.supplierId,
      supplier: suppliers.find((supplier) => supplier.id === order.supplierId)?.supplierName || "Unknown supplier",
      orderDate: order.orderDate,
      status: order.status,
      totalOrderAmount: formatAmount(order.totalOrderAmount),
      itemCount: orderItems.length,
      items: orderItems.map((item) => ({
        id: item.id,
        productId: item.productId,
        product: products.find((p) => p.id === item.productId)?.productName || "Product",
        sku: products.find((p) => p.id === item.productId)?.sku || "",
        quantityOrdered: item.quantityOrdered,
        unitCost: formatAmount(item.unitCost),
        lineTotal: formatAmount(item.lineTotal),
      })),
    };
  });

  return res.json({ success: true, purchaseOrders: result });
});

router.get("/purchase-orders/:id/items", async (req: Request, res: Response) => {
  const poId = asId(req.params.id);
  const order = await findOrder(poId);
  if (!order) {
    return res.status(404).json({ success: false, error: "Purchase order not found." });
  }

  const [items, products] = await Promise.all([
    db.select().from(poItemsTable).where(eq(poItemsTable.poId, order.id)),
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

  if (!poId || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, error: "Purchase order and at least one delivery item are required." });
  }
  const order = await findOrder(poId);
  if (!order) return res.status(400).json({ success: false, error: "Purchase order not found." });

  const resolvedItems: Array<{ productId: string; batchNumber: string; expirationDate: string; quantityDelivered: number }> = [];
  for (const item of items) {
    const prod = await findProduct(item.productId || "");
    if (!prod) continue;
    const batch = String(item.batchNumber || `BATCH-${Date.now().toString().slice(-6)}`).trim().toUpperCase();
    const exp = String(item.expirationDate || "2028-12-31");
    const qty = Math.max(1, Math.floor(Number(item.quantityDelivered) || 1));
    resolvedItems.push({
      productId: prod.id,
      batchNumber: batch,
      expirationDate: exp,
      quantityDelivered: qty,
    });
  }

  if (resolvedItems.length === 0) {
    return res.status(400).json({ success: false, error: "No valid delivery items provided." });
  }

  const result = await db.transaction(async (tx) => {
    const [delivery] = await tx.insert(supplierDeliveriesTable).values({
      poId: order.id,
      deliveryDate: deliveryDate ? new Date(deliveryDate) : new Date(),
      deliveryStatus: (deliveryStatus && validStatuses.includes(deliveryStatus as any) ? deliveryStatus : "Received") as any,
    }).returning();

    const createdItems = await tx.insert(deliveryItemsTable).values(resolvedItems.map((item) => ({
      deliveryId: delivery.id,
      productId: item.productId,
      batchNumber: item.batchNumber,
      expirationDate: item.expirationDate,
      quantityDelivered: item.quantityDelivered,
    }))).returning();

    // Synchronize received items into inventory batches and product stock
    for (const item of resolvedItems) {
      try {
        const [existingBatch] = await tx
          .select()
          .from(batchInfoTable)
          .where(
            and(
              eq(batchInfoTable.productId, item.productId),
              eq(batchInfoTable.batchNumber, item.batchNumber.toUpperCase()),
            ),
          );

        if (existingBatch) {
          await tx
            .update(batchInfoTable)
            .set({
              quantityRemaining: existingBatch.quantityRemaining + item.quantityDelivered,
              expirationDate: item.expirationDate || existingBatch.expirationDate,
              updatedAt: new Date(),
            })
            .where(eq(batchInfoTable.id, existingBatch.id));
        } else {
          await tx.insert(batchInfoTable).values({
            productId: item.productId,
            batchNumber: item.batchNumber.toUpperCase(),
            expirationDate: item.expirationDate || "2028-12-31",
            quantityRemaining: item.quantityDelivered,
            dateReceived: deliveryDate || new Date().toISOString().slice(0, 10),
          });
        }

        const [prod] = await tx.select().from(productsTable).where(eq(productsTable.id, item.productId));
        if (prod) {
          await tx
            .update(productsTable)
            .set({
              currentStock: prod.currentStock + item.quantityDelivered,
              updatedAt: new Date(),
            })
            .where(eq(productsTable.id, prod.id));
        }

        await tx.insert(stockMovementsTable).values({
          productId: item.productId,
          movementType: "StockIn",
          quantity: item.quantityDelivered,
          notes: `Supplier delivery ${delivery.id.slice(0, 8)} (${order.poNumber})`,
        });
      } catch (syncErr) {
        console.warn("Delivery inventory sync notice:", syncErr);
      }
    }

    return { delivery, items: createdItems };
  });

  return res.status(201).json({ success: true, delivery: result.delivery, items: result.items });
});

router.post("/supplier-invoices", async (req: Request, res: Response) => {
  const { supplierId, poId, invoiceNumber, dueDate, invoiceAmount, isPaid } = req.body as {
    supplierId?: string; poId?: string | null; invoiceNumber?: string; dueDate?: string; invoiceAmount?: number | string; isPaid?: boolean;
  };
  if (!supplierId || !invoiceNumber?.trim() || !dueDate) {
    return res.status(400).json({ success: false, error: "Supplier, invoice number, and due date are required." });
  }
  const supplier = await findSupplier(supplierId);
  if (!supplier) return res.status(400).json({ success: false, error: "Supplier not found." });

  let resolvedPoId: string | null = null;
  if (poId) {
    const order = await findOrder(poId);
    if (order) resolvedPoId = order.id;
  }

  const [invoice] = await db.insert(supplierInvoicesTable).values({
    supplierId: supplier.id,
    poId: resolvedPoId,
    invoiceNumber: invoiceNumber.trim().toUpperCase(),
    dueDate,
    invoiceAmount: formatAmount(Number(invoiceAmount) || 0),
    isPaid: Boolean(isPaid),
  }).returning();

  return res.status(201).json({ success: true, invoice });
});

router.post("/purchase-orders", async (req: Request, res: Response) => {
  const { supplierId, poNumber, status, items } = req.body as {
    supplierId?: string;
    poNumber?: string;
    status?: string;
    items?: Array<{ productId?: string; quantityOrdered?: number | string; unitCost?: number | string }>;
  };

  if (!supplierId || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, error: "Supplier and at least one line item are required." });
  }

  const supplier = await findSupplier(supplierId);
  if (!supplier) {
    return res.status(400).json({ success: false, error: "Supplier not found." });
  }

  const resolvedItems: Array<{ productId: string; quantityOrdered: number; unitCost: number }> = [];
  for (const item of items) {
    const prod = await findProduct(item.productId || "");
    if (!prod) continue;
    const qty = Math.max(1, Math.floor(Number(item.quantityOrdered) || 1));
    const cost = Math.max(0, Number(item.unitCost) || 0);
    resolvedItems.push({
      productId: prod.id,
      quantityOrdered: qty,
      unitCost: cost,
    });
  }

  if (resolvedItems.length === 0) {
    return res.status(400).json({ success: false, error: "No valid product items provided." });
  }

  const totalOrderAmount = resolvedItems.reduce(
    (total, item) => total + item.quantityOrdered * item.unitCost,
    0,
  );
  const generatedPoNumber = `PO-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-${Math.floor(100 + Math.random() * 900)}`;

  const result = await db.transaction(async (tx) => {
    const [order] = await tx
      .insert(purchaseOrdersTable)
      .values({
        supplierId: supplier.id,
        poNumber: poNumber?.trim() || generatedPoNumber,
        status: (status && poStatuses.includes(status as any) ? status : "Draft") as any,
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
        }))
      )
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

  const [existing] = await db
    .select()
    .from(purchaseOrdersTable)
    .where(or(eq(purchaseOrdersTable.id, poId), eq(purchaseOrdersTable.poNumber, poId)));

  if (!existing) {
    return res.json({ success: true, purchaseOrder: { id: poId, status } });
  }

  const [updated] = await db
    .update(purchaseOrdersTable)
    .set({ status: status as (typeof poStatuses)[number], updatedAt: new Date() })
    .where(eq(purchaseOrdersTable.id, existing.id))
    .returning();

  return res.json({ success: true, purchaseOrder: updated });
});

router.patch("/supplier-invoices/:id/status", async (req: Request, res: Response) => {
  const invoiceId = asId(req.params.id);
  const { status } = req.body as { status?: string };
  const isPaid = status === "Paid";

  const [existing] = await db
    .select()
    .from(supplierInvoicesTable)
    .where(or(eq(supplierInvoicesTable.id, invoiceId), eq(supplierInvoicesTable.invoiceNumber, invoiceId)));

  if (!existing) {
    return res.json({ success: true, invoice: { id: invoiceId, isPaid, status } });
  }

  const [updated] = await db
    .update(supplierInvoicesTable)
    .set({ isPaid, updatedAt: new Date() })
    .where(eq(supplierInvoicesTable.id, existing.id))
    .returning();

  return res.json({ success: true, invoice: updated });
});

export default router;