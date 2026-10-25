import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq, ilike, inArray, or } from "drizzle-orm";
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
  accountsPayableTable,
  supplierPaymentsTable,
} from "@workspace/db";
import { requireAuth, requireRoles } from "../middleware/auth";

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

async function ensureAccountsPayableRecords(supplierId?: string) {
  const invoices = supplierId
    ? await db
        .select()
        .from(supplierInvoicesTable)
        .where(eq(supplierInvoicesTable.supplierId, supplierId))
    : await db.select().from(supplierInvoicesTable);
  if (invoices.length === 0) return;

  const invoiceIds = invoices.map((invoice) => invoice.id);
  const existing = await db
    .select({ invoiceId: accountsPayableTable.invoiceId })
    .from(accountsPayableTable)
    .where(inArray(accountsPayableTable.invoiceId, invoiceIds));
  const existingIds = new Set(existing.map((payable) => payable.invoiceId));
  const missing = invoices.filter(
    (invoice) =>
      !existingIds.has(invoice.id) && Number(invoice.invoiceAmount) > 0,
  );
  if (missing.length === 0) return;

  await db
    .insert(accountsPayableTable)
    .values(
      missing.map((invoice) => ({
        supplierId: invoice.supplierId,
        invoiceId: invoice.id,
        totalOwed: formatAmount(invoice.invoiceAmount),
        totalPaid: invoice.isPaid
          ? formatAmount(invoice.invoiceAmount)
          : "0.00",
        balance: invoice.isPaid ? "0.00" : formatAmount(invoice.invoiceAmount),
      })),
    )
    .onConflictDoNothing({ target: accountsPayableTable.invoiceId });
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
    await ensureAccountsPayableRecords(supplierId);

    const [orders, deliveries, invoices, payables] = await Promise.all([
      db
        .select()
        .from(purchaseOrdersTable)
        .where(eq(purchaseOrdersTable.supplierId, supplierId))
        .orderBy(desc(purchaseOrdersTable.orderDate)),
      db.select().from(supplierDeliveriesTable),
      db
        .select()
        .from(supplierInvoicesTable)
        .where(eq(supplierInvoicesTable.supplierId, supplierId))
        .orderBy(desc(supplierInvoicesTable.createdAt)),
      db
        .select()
        .from(accountsPayableTable)
        .where(eq(accountsPayableTable.supplierId, supplierId)),
    ]);
    const orderIds = orders.map((order) => order.id);
    const supplierDeliveries = orderIds.length
      ? deliveries.filter((delivery) => orderIds.includes(delivery.poId))
      : [];
    const payableIds = payables.map((payable) => payable.id);
    const payments = payableIds.length
      ? await db
          .select()
          .from(supplierPaymentsTable)
          .where(inArray(supplierPaymentsTable.apId, payableIds))
          .orderBy(desc(supplierPaymentsTable.paymentDate))
      : [];

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
        totalPaid: formatAmount(
          payables.reduce((sum, payable) => sum + Number(payable.totalPaid), 0),
        ),
        openBalance: formatAmount(
          payables.reduce((sum, payable) => sum + Number(payable.balance), 0),
        ),
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
    await ensureAccountsPayableRecords();
    const [payables, suppliers, invoices] = await Promise.all([
      db
        .select()
        .from(accountsPayableTable)
        .orderBy(desc(accountsPayableTable.createdAt)),
      db.select().from(suppliersTable),
      db.select().from(supplierInvoicesTable),
    ]);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const rows = payables.map((payable) => {
      const invoice = invoices.find((item) => item.id === payable.invoiceId);
      const dueDate = invoice?.dueDate
        ? new Date(`${invoice.dueDate}T00:00:00`)
        : null;
      const balance = Number(payable.balance);
      return {
        ...payable,
        supplier:
          suppliers.find((item) => item.id === payable.supplierId)
            ?.supplierName || "Unknown supplier",
        invoiceNumber: invoice?.invoiceNumber || "Unknown invoice",
        dueDate: invoice?.dueDate || null,
        status:
          balance <= 0
            ? "Paid"
            : dueDate && dueDate < today
              ? "Overdue"
              : "Open",
      };
    });
    const weekEnd = new Date(today);
    weekEnd.setDate(weekEnd.getDate() + 7);
    return res.json({
      success: true,
      accountsPayable: rows,
      summary: {
        totalOpen: formatAmount(
          rows.reduce((sum, row) => sum + Number(row.balance), 0),
        ),
        overdue: formatAmount(
          rows
            .filter((row) => row.status === "Overdue")
            .reduce((sum, row) => sum + Number(row.balance), 0),
        ),
        dueThisWeek: formatAmount(
          rows
            .filter(
              (row) =>
                row.dueDate &&
                new Date(`${row.dueDate}T00:00:00`) >= today &&
                new Date(`${row.dueDate}T00:00:00`) <= weekEnd,
            )
            .reduce((sum, row) => sum + Number(row.balance), 0),
        ),
      },
    });
  },
);

router.post(
  "/supplier-payments",
  requireRoles("Admin", "FrontDesk"),
  async (req: Request, res: Response) => {
    const { apId, amountPaid, paymentDate, notes } = req.body ?? {};
    const amount = Number(amountPaid);
    if (
      !uuidPattern.test(String(apId || "")) ||
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      return res.status(400).json({
        error: "A valid payable and positive payment amount are required.",
      });
    }
    const [payable] = await db
      .select()
      .from(accountsPayableTable)
      .where(eq(accountsPayableTable.id, apId));
    if (!payable)
      return res.status(404).json({ error: "Account payable not found." });
    if (amount > Number(payable.balance))
      return res
        .status(400)
        .json({ error: "Payment cannot exceed the outstanding balance." });
    const paidAt = paymentDate
      ? new Date(`${paymentDate}T00:00:00`)
      : new Date();
    if (Number.isNaN(paidAt.getTime()))
      return res.status(400).json({ error: "Enter a valid payment date." });

    const result = await db.transaction(async (tx) => {
      const newPaid = Number(payable.totalPaid) + amount;
      const newBalance = Number(payable.balance) - amount;
      const [payment] = await tx
        .insert(supplierPaymentsTable)
        .values({
          apId: payable.id,
          amountPaid: formatAmount(amount),
          paymentDate: paidAt,
          notes: typeof notes === "string" ? notes.trim() || null : null,
        })
        .returning();
      const [updated] = await tx
        .update(accountsPayableTable)
        .set({
          totalPaid: formatAmount(newPaid),
          balance: formatAmount(newBalance),
          lastPaymentDate: paidAt.toISOString().slice(0, 10),
          updatedAt: new Date(),
        })
        .where(eq(accountsPayableTable.id, payable.id))
        .returning();
      if (newBalance === 0) {
        await tx
          .update(supplierInvoicesTable)
          .set({ isPaid: true })
          .where(eq(supplierInvoicesTable.id, payable.invoiceId));
      }
      return { payment, payable: updated };
    });
    return res.status(201).json({ success: true, ...result });
  },
);

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
      .orderBy(desc(purchaseOrdersTable.orderDate)),
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
        unitCost: formatAmount(item.unitCost),
        lineTotal: formatAmount(item.lineTotal),
      })),
    });
  },
);

router.get("/supplier-deliveries", async (_req: Request, res: Response) => {
  const [deliveries, deliveryItems, orders, suppliers, products] =
    await Promise.all([
      db.select().from(supplierDeliveriesTable),
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
  const [invoices, suppliers, orders] = await Promise.all([
    db.select().from(supplierInvoicesTable),
    db.select().from(suppliersTable),
    db.select().from(purchaseOrdersTable),
  ]);

  const supplierById = new Map(suppliers.map((supplier) => [supplier.id, supplier]));
  const orderById = new Map(orders.map((order) => [order.id, order]));
  const result = invoices.map((invoice) => ({
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    supplierId: invoice.supplierId,
    supplier:
      supplierById.get(invoice.supplierId)?.supplierName || "Unknown supplier",
    poId: invoice.poId,
    poNumber:
      (invoice.poId ? orderById.get(invoice.poId)?.poNumber : null) || null,
    dueDate: invoice.dueDate,
    invoiceAmount: formatAmount(invoice.invoiceAmount),
    isPaid: invoice.isPaid,
    status: invoice.isPaid ? "Paid" : "Unpaid",
  }));

  return res.json({ success: true, invoices: result });
});

router.post(
  "/supplier-deliveries",
  requireRoles("Admin", "FrontDesk"),
  async (req: Request, res: Response) => {
    const { poId, deliveryDate, deliveryStatus, items } = req.body as {
      poId?: string;
      deliveryDate?: string;
      deliveryStatus?: string;
      items?: Array<{
        productId?: string;
        batchNumber?: string;
        expirationDate?: string;
        quantityDelivered?: number | string;
      }>;
    };
    const validStatuses = supplierDeliveriesTable.deliveryStatus.enumValues;

    if (!poId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Purchase order and at least one delivery item are required.",
      });
    }
    const order = await findOrder(poId);
    if (!order)
      return res
        .status(400)
        .json({ success: false, error: "Purchase order not found." });
    if (
      deliveryDate &&
      Number.isNaN(new Date(`${deliveryDate}T00:00:00`).getTime())
    ) {
      return res
        .status(400)
        .json({ success: false, error: "Enter a valid delivery date." });
    }

    const resolvedItems: Array<{
      productId: string;
      batchNumber: string;
      expirationDate: string;
      quantityDelivered: number;
    }> = [];
    for (const item of items) {
      const prod = await findProduct(item.productId || "");
      if (!prod) continue;
      const batch = String(
        item.batchNumber || `BATCH-${Date.now().toString().slice(-6)}`,
      )
        .trim()
        .toUpperCase();
      const exp = String(item.expirationDate || "2028-12-31");
      const qty = Math.max(1, Math.floor(Number(item.quantityDelivered) || 1));
      if (!/^[A-Z0-9-]+$/.test(batch))
        return res.status(400).json({
          success: false,
          error:
            "Batch numbers may contain only letters, numbers, and hyphens.",
        });
      const expiryDate = new Date(`${exp}T00:00:00`);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (Number.isNaN(expiryDate.getTime()) || expiryDate < today)
        return res.status(400).json({
          success: false,
          error: "Expiration date cannot be in the past.",
        });
      resolvedItems.push({
        productId: prod.id,
        batchNumber: batch,
        expirationDate: exp,
        quantityDelivered: qty,
      });
    }

    if (resolvedItems.length === 0) {
      return res
        .status(400)
        .json({ success: false, error: "No valid delivery items provided." });
    }

    const result = await db.transaction(async (tx) => {
      const [delivery] = await tx
        .insert(supplierDeliveriesTable)
        .values({
          poId: order.id,
          deliveryDate: deliveryDate ? new Date(deliveryDate) : new Date(),
          deliveryStatus: (deliveryStatus &&
          validStatuses.includes(deliveryStatus as any)
            ? deliveryStatus
            : "Received") as any,
        })
        .returning();

      const createdItems = await tx
        .insert(deliveryItemsTable)
        .values(
          resolvedItems.map((item) => ({
            deliveryId: delivery.id,
            productId: item.productId,
            batchNumber: item.batchNumber,
            expirationDate: item.expirationDate,
            quantityDelivered: item.quantityDelivered,
          })),
        )
        .returning();

      if (
        ["Received", "Inspected", "Partial"].includes(delivery.deliveryStatus)
      )
        for (const item of resolvedItems) {
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
                quantityRemaining:
                  existingBatch.quantityRemaining + item.quantityDelivered,
                expirationDate:
                  item.expirationDate || existingBatch.expirationDate,
                updatedAt: new Date(),
              })
              .where(eq(batchInfoTable.id, existingBatch.id));
          } else {
            await tx.insert(batchInfoTable).values({
              productId: item.productId,
              batchNumber: item.batchNumber.toUpperCase(),
              expirationDate: item.expirationDate || "2028-12-31",
              quantityRemaining: item.quantityDelivered,
              dateReceived:
                deliveryDate || new Date().toISOString().slice(0, 10),
            });
          }

          const [prod] = await tx
            .select()
            .from(productsTable)
            .where(eq(productsTable.id, item.productId));
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
        }

      if (["Received", "Inspected"].includes(delivery.deliveryStatus)) {
        await tx
          .update(purchaseOrdersTable)
          .set({ status: "Fulfilled", updatedAt: new Date() })
          .where(eq(purchaseOrdersTable.id, order.id));
      }

      return { delivery, items: createdItems };
    });

    return res
      .status(201)
      .json({ success: true, delivery: result.delivery, items: result.items });
  },
);

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
    if (!supplierId || !invoiceNumber?.trim() || !dueDate) {
      return res.status(400).json({
        success: false,
        error: "Supplier, invoice number, and due date are required.",
      });
    }
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
    });

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
    if (poNumber?.trim() && !/^[A-Za-z0-9-]+$/.test(poNumber.trim())) {
      return res.status(400).json({
        success: false,
        error: "PO numbers may contain only letters, numbers, and hyphens.",
      });
    }

    const resolvedItems: Array<{
      productId: string;
      quantityOrdered: number;
      unitCost: number;
    }> = [];
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
      return res
        .status(400)
        .json({ success: false, error: "No valid product items provided." });
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
      return res.json({ success: true, purchaseOrder: { id: poId, status } });
    }

    const updated = await db.transaction(async (tx) => {
      const [order] = await tx
        .update(purchaseOrdersTable)
        .set({
          status: status as (typeof poStatuses)[number],
          updatedAt: new Date(),
        })
        .where(eq(purchaseOrdersTable.id, existing.id))
        .returning();

      // If transitioning to Fulfilled, receive any unfulfilled items into inventory
      if (status === "Fulfilled" && existing.status !== "Fulfilled") {
        const orderItems = await tx
          .select()
          .from(poItemsTable)
          .where(eq(poItemsTable.poId, existing.id));

        const existingDeliveries = await tx
          .select()
          .from(supplierDeliveriesTable)
          .where(eq(supplierDeliveriesTable.poId, existing.id));

        const deliveryIds = existingDeliveries.map((d) => d.id);
        const existingDeliveryItems =
          deliveryIds.length > 0
            ? await tx
                .select()
                .from(deliveryItemsTable)
                .where(inArray(deliveryItemsTable.deliveryId, deliveryIds))
            : [];

        const deliveredQtyByProd = new Map<string, number>();
        for (const di of existingDeliveryItems) {
          deliveredQtyByProd.set(
            di.productId,
            (deliveredQtyByProd.get(di.productId) || 0) + di.quantityDelivered,
          );
        }

        const itemsToReceive: Array<{
          productId: string;
          quantity: number;
        }> = [];

        for (const item of orderItems) {
          const alreadyDelivered = deliveredQtyByProd.get(item.productId) || 0;
          const qtyToReceive = Math.max(0, item.quantityOrdered - alreadyDelivered);
          if (qtyToReceive > 0) {
            itemsToReceive.push({
              productId: item.productId,
              quantity: qtyToReceive,
            });
          }
        }

        if (itemsToReceive.length > 0) {
          const [delivery] = await tx
            .insert(supplierDeliveriesTable)
            .values({
              poId: existing.id,
              deliveryDate: new Date(),
              deliveryStatus: "Received",
            })
            .returning();

          for (const item of itemsToReceive) {
            const batchNum = `PO-${existing.poNumber}`.toUpperCase();

            await tx.insert(deliveryItemsTable).values({
              deliveryId: delivery.id,
              productId: item.productId,
              batchNumber: batchNum,
              expirationDate: "2028-12-31",
              quantityDelivered: item.quantity,
            });

            const [existingBatch] = await tx
              .select()
              .from(batchInfoTable)
              .where(
                and(
                  eq(batchInfoTable.productId, item.productId),
                  eq(batchInfoTable.batchNumber, batchNum),
                ),
              );

            if (existingBatch) {
              await tx
                .update(batchInfoTable)
                .set({
                  quantityRemaining:
                    existingBatch.quantityRemaining + item.quantity,
                  updatedAt: new Date(),
                })
                .where(eq(batchInfoTable.id, existingBatch.id));
            } else {
              await tx.insert(batchInfoTable).values({
                productId: item.productId,
                batchNumber: batchNum,
                expirationDate: "2028-12-31",
                quantityRemaining: item.quantity,
                dateReceived: new Date().toISOString().slice(0, 10),
              });
            }

            const [prod] = await tx
              .select()
              .from(productsTable)
              .where(eq(productsTable.id, item.productId));

            if (prod) {
              await tx
                .update(productsTable)
                .set({
                  currentStock: prod.currentStock + item.quantity,
                  updatedAt: new Date(),
                })
                .where(eq(productsTable.id, prod.id));
            }

            await tx.insert(stockMovementsTable).values({
              productId: item.productId,
              movementType: "StockIn",
              quantity: item.quantity,
              notes: `Fulfilled purchase order ${existing.poNumber}`,
            });
          }
        }
      }

      return order;
    });

    return res.json({ success: true, purchaseOrder: updated });
  },
);

router.patch(
  "/supplier-invoices/:id/status",
  requireRoles("Admin", "FrontDesk"),
  async (req: Request, res: Response) => {
    const invoiceId = asId(req.params.id);
    const { status } = req.body as { status?: string };
    const isPaid = status === "Paid";

    const [existing] = await db
      .select()
      .from(supplierInvoicesTable)
      .where(
        or(
          eq(supplierInvoicesTable.id, invoiceId),
          eq(supplierInvoicesTable.invoiceNumber, invoiceId),
        ),
      );

    if (!existing) {
      return res.json({
        success: true,
        invoice: { id: invoiceId, isPaid, status },
      });
    }

    const [updated] = await db
      .update(supplierInvoicesTable)
      .set({ isPaid })
      .where(eq(supplierInvoicesTable.id, existing.id))
      .returning();

    return res.json({ success: true, invoice: updated });
  },
);

export default router;
