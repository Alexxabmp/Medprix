import { Router, type IRouter, type Request, type Response } from "express";
import { desc, eq, ilike } from "drizzle-orm";
import { db, queryDb, withTransaction, purchaseOrdersTable, supplierDeliveriesTable, suppliersTable } from "@workspace/db";
import { normalizeSupplierTerms, isSupplierTermsBasis, SUPPLIER_TERMS_LABEL } from "@workspace/api-zod";
import { requireAuth, requireRoles } from "../middleware/auth";
import { readSupplierPayables, readSupplierInvoices, readSupplierHistory } from "../lib/supplier-payable-read-model";
import { createProcurementStore, ProcurementError } from "../lib/procurement-store";
import { writeAuditEvent } from "../lib/audit-events";

/**
 * Procurement and supplier payables. Admin and Front desk only (cashiers have no procurement access).
 * Every write goes through the procurement store, which holds all workflow rules.
 */
export function createProcurementRouter(store = createProcurementStore(withTransaction, queryDb)): IRouter {
  const router: IRouter = Router();
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const contactPattern = /^(?:\+639|09)\d{9}$/;
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const actorOf = (req: Request, res: Response) => ({ ...res.locals.user!, deviceIp: String(req.ip || "").slice(0, 50) });
  const id = (req: Request) => String(req.params.id ?? "");

  /** Runs one store call and turns its errors into plain messages. */
  const handle = (what: string, work: (req: Request, res: Response) => Promise<unknown>, created = false) =>
    async (req: Request, res: Response) => {
      res.set("Cache-Control", "no-store");
      try {
        const result: any = await work(req, res);
        if (result === null) return res.status(404).json({ error: "Not found. Refresh and try again." });
        return res.status(created && !result?.replayed ? 201 : 200).json({ success: true, ...result });
      } catch (error) {
        if (error instanceof ProcurementError) return res.status(error.status).json({ success: false, error: error.message, ...error.details });
        req.log?.error({ err: error }, what);
        return res.status(503).json({ success: false, error: "Procurement records are unavailable right now. Your last step was not saved; try again." });
      }
    };

  router.use(requireAuth);
  router.use(requireRoles("Admin", "FrontDesk"));

  // ─── Suppliers ─────────────────────────────────────────────────────────────
  router.get("/suppliers", handle("Supplier list failed", async () => {
    const [suppliers, orders] = await Promise.all([db.select().from(suppliersTable), db.select().from(purchaseOrdersTable)]);
    return {
      suppliers: suppliers.map(supplier => {
        const mine = orders.filter(order => order.supplierId === supplier.id && order.status !== "Cancelled");
        return {
          id: supplier.id, name: supplier.supplierName, code: supplier.id.slice(0, 8).toUpperCase(),
          contact: supplier.contactPerson || supplier.contactNumber || supplier.email || "No contact listed",
          contactPerson: supplier.contactPerson, contactNumber: supplier.contactNumber, email: supplier.email, address: supplier.address,
          paymentTerms: supplier.paymentTerms, termsBasis: supplier.termsBasis, termsLabel: SUPPLIER_TERMS_LABEL[supplier.paymentTerms],
          orders: mine.length,
          orderValue: mine.reduce((sum, order) => sum + Number(order.totalOrderAmount), 0).toFixed(2),
          status: "Active",
        };
      }),
    };
  }));

  router.post("/suppliers", requireRoles("Admin"), handle("Supplier create failed", async (req, res) => {
    const body = req.body ?? {};
    const name = typeof body.supplierName === "string" ? body.supplierName.trim() : "";
    const contact = typeof body.contactPerson === "string" ? body.contactPerson.trim() : "";
    const phone = typeof body.contactNumber === "string" ? body.contactNumber.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const address = typeof body.address === "string" ? body.address.trim() : "";
    const terms = normalizeSupplierTerms(body.paymentTerms);
    const basis = body.termsBasis ?? "InvoiceDate";
    const fail = (message: string, field: string) => new ProcurementError(400, message, { errors: { [field]: message } });
    if (!terms) throw fail("Choose the supplier's payment terms.", "paymentTerms");
    if (!isSupplierTermsBasis(basis)) throw fail("Choose where the due date counts from.", "termsBasis");
    if (name.length < 2 || name.length > 120 || !/^[\p{L}\p{N}][\p{L}\p{N}\s&.,'()/-]*$/u.test(name))
      throw fail("Supplier name must be 2 to 120 characters and contain only standard name characters.", "supplierName");
    if (phone && !contactPattern.test(phone)) throw fail("Contact number must use 09XXXXXXXXX or +639XXXXXXXXX format.", "contactNumber");
    if (email && !emailPattern.test(email)) throw fail("Enter a valid email address.", "email");
    if (contact.length > 120 || email.length > 255 || address.length > 500) throw fail("One or more supplier details are too long.", "supplierName");
    const [duplicate] = await db.select({ id: suppliersTable.id }).from(suppliersTable).where(ilike(suppliersTable.supplierName, name));
    if (duplicate) throw new ProcurementError(409, "A supplier with this name already exists.", { errors: { supplierName: "A supplier with this name already exists." } });
    return withTransaction(async query => {
      const { rows: [supplier] } = await query(`INSERT INTO suppliers(supplier_name,contact_person,contact_number,email,address,payment_terms,terms_basis)
        VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [name, contact || null, phone || null, email || null, address || null, terms, basis]);
      await writeAuditEvent(query, { actor: res.locals.user!, action: "CREATE", activity: "Added supplier", module: "Procurement",
        description: `Added supplier ${name} (${SUPPLIER_TERMS_LABEL[terms]})`, deviceIp: String(req.ip || "").slice(0, 50) });
      return { supplier };
    });
  }, true));

  router.patch("/suppliers/:id/terms", requireRoles("Admin"), handle("Supplier terms update failed",
    (req, res) => store.updateSupplierTerms(id(req), req.body, actorOf(req, res))));

  router.get("/suppliers/:id/history", handle("Supplier history failed", async req => {
    const supplierId = id(req);
    if (!uuidPattern.test(supplierId)) throw new ProcurementError(400, "Invalid supplier.");
    const [supplier] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, supplierId));
    if (!supplier) return null;
    const [orders, model] = await Promise.all([
      db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.supplierId, supplierId)).orderBy(desc(purchaseOrdersTable.orderDate)),
      readSupplierHistory(queryDb, supplierId),
    ]);
    const deliveries = orders.length
      ? (await db.select().from(supplierDeliveriesTable)).filter(delivery => orders.some(order => order.id === delivery.poId))
      : [];
    return {
      supplier: { ...supplier, termsLabel: SUPPLIER_TERMS_LABEL[supplier.paymentTerms] },
      summary: {
        totalOrders: orders.filter(order => order.status !== "Cancelled").length,
        totalOrdered: orders.filter(order => order.status !== "Cancelled").reduce((sum, order) => sum + Number(order.totalOrderAmount), 0).toFixed(2),
        totalPaid: model.totalPaid, openBalance: model.summary.totalOpen,
        needsReview: model.summary.needsReview, invoicesNeedingReview: model.reconciliation.invoicesNeedingReview,
      },
      orders, deliveries, invoices: model.invoices, payables: model.payables, payments: model.payments,
    };
  }));

  // ─── Payables (read) ───────────────────────────────────────────────────────
  router.get("/accounts-payable", handle("Payables read failed", async () => {
    const model = await readSupplierPayables(queryDb);
    return { accountsPayable: model.payables, summary: model.summary, reconciliation: model.reconciliation };
  }));
  router.get("/supplier-invoices", handle("Invoice list failed", async () => {
    const model = await readSupplierInvoices(queryDb);
    return { invoices: model.invoices, reconciliation: model.reconciliation };
  }));

  // ─── Purchase orders ───────────────────────────────────────────────────────
  router.get("/purchase-orders", handle("Order list failed", () => store.listOrders()));
  router.get("/purchase-orders/:id", handle("Order read failed", req => store.readOrder(id(req))));
  router.post("/purchase-orders", handle("Order create failed", (req, res) => store.createOrder(req.body, actorOf(req, res)), true));
  router.put("/purchase-orders/:id", handle("Order update failed", (req, res) => store.updateOrder(id(req), req.body, actorOf(req, res))));
  router.post("/purchase-orders/:id/submit", handle("Order submit failed", (req, res) => store.submitOrder(id(req), actorOf(req, res))));
  router.post("/purchase-orders/:id/approve", handle("Order approve failed", (req, res) => store.approveOrder(id(req), actorOf(req, res))));
  router.post("/purchase-orders/:id/return", handle("Order return failed", (req, res) => store.returnOrder(id(req), req.body, actorOf(req, res))));
  router.post("/purchase-orders/:id/send", handle("Order send failed", (req, res) => store.sendOrder(id(req), req.body, actorOf(req, res))));
  router.post("/purchase-orders/:id/cancel", handle("Order cancel failed", (req, res) => store.cancelOrder(id(req), req.body, actorOf(req, res))));
  router.post("/purchase-orders/:id/close-short", handle("Order close failed", (req, res) => store.closeShort(id(req), req.body, actorOf(req, res))));

  // Receiving IS the receiving report. The Idempotency-Key makes a retry after a dropped connection safe.
  router.post("/purchase-orders/:id/deliveries", handle("Receiving failed",
    (req, res) => store.receiveDelivery(req.get("Idempotency-Key"), { ...req.body, poId: id(req) }, actorOf(req, res)), true));

  // ─── Invoices ──────────────────────────────────────────────────────────────
  router.post("/purchase-orders/:id/invoices", handle("Invoice record failed",
    (req, res) => store.recordInvoice(req.get("Idempotency-Key"), { ...req.body, poId: id(req) }, actorOf(req, res)), true));
  router.post("/supplier-invoices/:id/verify", handle("Invoice verify failed", (req, res) => store.verifyInvoice(id(req), req.body, actorOf(req, res))));

  // ─── Payments ──────────────────────────────────────────────────────────────
  router.post("/supplier-payments", handle("Payment record failed",
    (req, res) => store.recordPayment(req.get("Idempotency-Key"), req.body, actorOf(req, res)), true));
  router.get("/supplier-payments/:id", handle("Payment read failed", req => store.readPayment(id(req))));
  router.patch("/supplier-payments/:id/receipt", handle("Payment receipt update failed",
    (req, res) => store.updatePaymentReceipt(id(req), req.body, actorOf(req, res))));

  return router;
}

export default createProcurementRouter();
