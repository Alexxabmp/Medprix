import { eq, sql } from "drizzle-orm";
import {
  accountsPayableTable,
  supplierInvoicesTable,
  supplierPaymentsTable,
} from "@workspace/db";
import type { db } from "@workspace/db";

export class SettlementError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function minorUnits(value: unknown): number {
  const text = String(value ?? "");
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(text)) return NaN;
  const [whole, fraction = ""] = text.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}
const money = (cents: number) =>
  `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateSettlement(body: any, requestKey: unknown) {
  if (
    typeof requestKey !== "string" ||
    !uuid.test(requestKey) ||
    !uuid.test(String(body?.apId || ""))
  )
    throw new SettlementError(
      400,
      "A valid payable and payment request key are required.",
    );
  const cents = minorUnits(body.amountPaid);
  if (!Number.isFinite(cents) || cents <= 0)
    throw new SettlementError(
      400,
      "Enter a positive payment amount with at most two decimal places.",
    );
  const date = body.paymentDate;
  if (
    typeof date !== "string" ||
    date.startsWith("0000") ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) ||
    new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date
  )
    throw new SettlementError(400, "Enter a valid payment date.");
  if (
    body.notes != null &&
    (typeof body.notes !== "string" || body.notes.length > 500)
  )
    throw new SettlementError(
      400,
      "Payment notes must be 500 characters or fewer.",
    );
  return {
    apId: String(body.apId),
    requestKey,
    cents,
    date,
    notes: String(body.notes || "").trim() || null,
  };
}

export function createSettlementService(database: typeof db) {
  async function reconcile(apId: string, key: string) {
    if (!uuid.test(apId) || !uuid.test(key))
      throw new SettlementError(400, "Invalid payment reference.");
    return database.transaction(async (tx) => {
      // Serializes reconciliation with a submission already executing for this payable.
      const [payable] = await tx
        .select()
        .from(accountsPayableTable)
        .where(eq(accountsPayableTable.id, apId))
        .for("update");
      if (!payable)
        throw new SettlementError(404, "Account payable not found.");
      const [payment] = await tx
        .select()
        .from(supplierPaymentsTable)
        .where(eq(supplierPaymentsTable.id, key));
      return { payment: payment?.apId === apId ? payment : null, payable };
    });
  }
  async function save(body: any, key: unknown) {
    const input = validateSettlement(body, key);
    return database.transaction(async (tx) => {
      const [payable] = await tx
        .select()
        .from(accountsPayableTable)
        .where(eq(accountsPayableTable.id, input.apId))
        .for("update");
      if (!payable)
        throw new SettlementError(404, "Account payable not found.");
      // The existing payment primary key supplies durable replay protection without a migration.
      const [previous] = await tx
        .select()
        .from(supplierPaymentsTable)
        .where(eq(supplierPaymentsTable.id, input.requestKey));
      if (previous) {
        if (
          previous.apId !== input.apId ||
          minorUnits(previous.amountPaid) !== input.cents ||
          previous.paymentDate.toISOString().slice(0, 10) !== input.date ||
          previous.notes !== input.notes
        )
          throw new SettlementError(
            409,
            "This payment request was already used with different details.",
          );
        return { payment: previous, payable, replayed: true };
      }
      const balance = minorUnits(payable.balance);
      const paid = minorUnits(payable.totalPaid);
      if (!Number.isFinite(balance) || !Number.isFinite(paid))
        throw new SettlementError(
          409,
          "This payable needs administrator review.",
        );
      if (paid + balance !== minorUnits(payable.totalOwed))
        throw new SettlementError(
          409,
          "This payable's totals disagree. Ask an administrator to review payment history.",
        );
      const [history] = await tx.select({
        paid: sql<string>`coalesce(sum(${supplierPaymentsTable.amountPaid}),0)::text`,
        latest: sql<string | null>`(max(${supplierPaymentsTable.paymentDate} AT TIME ZONE 'UTC'))::date::text`,
      }).from(supplierPaymentsTable).where(eq(supplierPaymentsTable.apId, input.apId));
      if (minorUnits(history.paid) !== paid)
        throw new SettlementError(409, "Recorded payments and payable totals disagree. Ask an administrator to review payment history.");
      if (history.latest !== payable.lastPaymentDate)
        throw new SettlementError(409, "Recorded payment dates and the payable summary disagree. Ask an administrator to review payment history.");
      if (input.cents > balance)
        throw new SettlementError(
          409,
          "Payment cannot exceed the current outstanding balance. Refresh the payable.",
        );
      const [invoice] = await tx
        .select()
        .from(supplierInvoicesTable)
        .where(eq(supplierInvoicesTable.id, payable.invoiceId));
      if (!invoice) throw new SettlementError(404, "Invoice not found.");
      if (invoice.supplierId !== payable.supplierId)
        throw new SettlementError(409, "Invoice and payable suppliers disagree. Ask an administrator to review the records.");
      if (minorUnits(invoice.invoiceAmount) !== minorUnits(payable.totalOwed))
        throw new SettlementError(409, "Invoice and payable amounts disagree. Ask an administrator to review payment history.");
      if (invoice.isPaid !== (balance === 0))
        throw new SettlementError(
          409,
          "Invoice and payable disagree. Ask an administrator to review payment history.",
        );
      const paidAt = new Date(`${input.date}T00:00:00Z`);
      const [payment] = await tx
        .insert(supplierPaymentsTable)
        .values({
          id: input.requestKey,
          apId: input.apId,
          amountPaid: money(input.cents),
          paymentDate: paidAt,
          notes: input.notes,
        })
        .returning();
      const [updated] = await tx
        .update(accountsPayableTable)
        .set({
          totalPaid: money(paid + input.cents),
          balance: money(balance - input.cents),
          lastPaymentDate: history.latest && history.latest > input.date ? history.latest : input.date,
          updatedAt: new Date(),
        })
        .where(eq(accountsPayableTable.id, input.apId))
        .returning();
      await tx
        .update(supplierInvoicesTable)
        .set({ isPaid: balance === input.cents })
        .where(eq(supplierInvoicesTable.id, payable.invoiceId));
      return { payment, payable: updated, replayed: false };
    });
  }
  return { save, reconcile };
}
