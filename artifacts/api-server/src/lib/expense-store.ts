import { isCalendarDate, pharmacyDate, isExpenseCategory, EXPENSE_CATEGORY_LABEL, type ExpenseCategory } from "@workspace/api-zod";
import { writeAuditEvent } from "./audit-events";

/** Operating expenses: record, list for a period, void with a reason (never delete). Admin and Front desk. */
export type Query = (text: string, params?: any[]) => Promise<{ rows: any[] }>;
export type Transaction = <T>(work: (query: Query) => Promise<T>) => Promise<T>;
export type ExpenseActor = { id: string; username: string; role: string; deviceIp?: string | null };

export class ExpenseError extends Error {
  constructor(public status: number, message: string, public details: Record<string, unknown> = {}) { super(message); }
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bad = (message: string, field: string) => new ExpenseError(400, message, { errors: { [field]: message } });
const peso = (cents: number) => `₱${(cents / 100).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;

function cleanText(value: unknown, field: string, label: string, max: number, required = false, min = 1): string | null {
  if (value === undefined || value === null || (typeof value === "string" && !value.trim())) {
    if (required) throw bad(`Enter ${label}.`, field);
    return null;
  }
  if (typeof value !== "string") throw bad(`Enter ${label}.`, field);
  const text = value.trim().replace(/\s+/g, " ");
  if (text.length < min || text.length > max) throw bad(`${label[0]!.toUpperCase()}${label.slice(1)} must be ${min} to ${max} characters.`, field);
  return text;
}

function row(r: any) {
  return {
    id: r.id, expenseDate: r.expense_date, category: r.category as ExpenseCategory, amount: r.amount, payee: r.payee,
    referenceNumber: r.reference_number, description: r.description, recordedBy: r.recorded_by_name, createdAt: r.created_at,
    voidedAt: r.voided_at, voidedBy: r.voided_by_name, voidReason: r.void_reason,
  };
}
const select = `SELECT e.*, e.expense_date::text AS expense_date, e.amount::text AS amount,
  ru.full_name AS recorded_by_name, vu.full_name AS voided_by_name
  FROM operating_expenses e LEFT JOIN users ru ON ru.id=e.recorded_by LEFT JOIN users vu ON vu.id=e.voided_by`;

export function createExpenseStore(transaction: Transaction, read: Query) {
  async function list(from: unknown, to: unknown) {
    if (!isCalendarDate(from) || !isCalendarDate(to) || from > to) throw new ExpenseError(400, "Enter a valid date range.");
    const { rows } = await read(`${select} WHERE e.expense_date BETWEEN $1::date AND $2::date ORDER BY e.expense_date DESC, e.created_at DESC`, [from, to]);
    return { expenses: rows.map(row) };
  }

  async function record(key: unknown, body: any, actor: ExpenseActor) {
    if (typeof key !== "string" || !uuid.test(key)) throw new ExpenseError(400, "This form is missing its save reference. Refresh the page and try again.");
    const id = key.toLowerCase();
    if (!isCalendarDate(body?.expenseDate)) throw bad("Enter the date of the expense.", "expenseDate");
    if (body.expenseDate > pharmacyDate()) throw bad("The expense date can't be in the future.", "expenseDate");
    if (!isExpenseCategory(body?.category)) throw bad("Choose a category.", "category");
    const raw = typeof body?.amount === "number" ? String(body.amount) : typeof body?.amount === "string" ? body.amount.trim().replace(/,/g, "") : "";
    if (!/^\d{1,10}(\.\d{1,2})?$/.test(raw) || Number(raw) <= 0) throw bad("Enter an amount above zero with at most two decimals.", "amount");
    const description = cleanText(body?.description, "description", "what the expense was for", 500, true, 3)!;
    const payee = cleanText(body?.payee, "payee", "who was paid", 120);
    const reference = cleanText(body?.referenceNumber, "referenceNumber", "the receipt or reference number", 100);
    return transaction(async query => {
      await query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [id]);
      const { rows: [existing] } = await query(`${select} WHERE e.id=$1`, [id]);
      if (existing) return { expense: row(existing), replayed: true };
      await query(`INSERT INTO operating_expenses(id,expense_date,category,amount,payee,reference_number,description,recorded_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [id, body.expenseDate, body.category, raw, payee, reference, description, actor.id]);
      await writeAuditEvent(query, { actor, action: "CREATE", activity: "Recorded expense", module: "Finance", deviceIp: actor.deviceIp ?? null,
        description: `Recorded ${EXPENSE_CATEGORY_LABEL[body.category as ExpenseCategory]} expense of ${peso(Math.round(Number(raw) * 100))} on ${body.expenseDate}: ${description}` });
      const { rows: [saved] } = await query(`${select} WHERE e.id=$1`, [id]);
      return { expense: row(saved), replayed: false };
    });
  }

  async function voidExpense(expenseId: string, body: any, actor: ExpenseActor) {
    if (!uuid.test(expenseId)) throw new ExpenseError(400, "Choose a valid expense.");
    const reason = cleanText(body?.reason, "reason", "why this entry is being voided", 500, true, 3)!;
    return transaction(async query => {
      const { rows: [current] } = await query(`SELECT * FROM operating_expenses WHERE id=$1 FOR UPDATE`, [expenseId]);
      if (!current) throw new ExpenseError(404, "Expense not found. Refresh the list.");
      if (current.voided_at) throw new ExpenseError(409, "This expense is already voided.");
      await query(`UPDATE operating_expenses SET voided_at=now(), voided_by=$2, void_reason=$3 WHERE id=$1`, [expenseId, actor.id, reason]);
      await writeAuditEvent(query, { actor, action: "VOID", activity: "Voided expense", module: "Finance", deviceIp: actor.deviceIp ?? null,
        description: `Voided ${current.category} expense of ${peso(Math.round(Number(current.amount) * 100))}: ${reason}` });
      const { rows: [saved] } = await query(`${select} WHERE e.id=$1`, [expenseId]);
      return { expense: row(saved) };
    });
  }

  return { list, record, voidExpense };
}
