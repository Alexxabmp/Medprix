import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  varchar,
  integer,
  date,
  timestamp,
  check,
  primaryKey,
  foreignKey,
  index,
} from "drizzle-orm/pg-core";
import { money } from "./_columns";
import { arPaymentsTable, wholesalePaymentPlanEnum } from "./wholesale";
import { wholesaleCollectionsTable } from "./wholesale-collections";
import { wholesaleFulfillmentsTable } from "./wholesale-fulfillment";

/** One schedule per fulfilled AR; AR already uniquely identifies its order. */
export const wholesaleInstallmentSchedulesTable = pgTable(
  "wholesale_installment_schedules",
  {
    arId: uuid("ar_id")
      .primaryKey()
      .references(() => wholesaleFulfillmentsTable.arId, {
        onDelete: "restrict",
      }),
    paymentPlan: wholesalePaymentPlanEnum("payment_plan").notNull(),
    planVersion: varchar("plan_version", { length: 32 }).notNull(),
    principal: money("principal").notNull(),
    installmentCount: integer("installment_count").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    receiptDate: date("receipt_date").notNull(),
    finalDueDate: date("final_due_date").notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "wholesale_schedule_plan_check",
      sql`(${t.paymentPlan}='Net30' AND ${t.installmentCount}=4 AND ${t.finalDueDate}=${t.receiptDate}+30) OR (${t.paymentPlan}='Net60' AND ${t.installmentCount}=8 AND ${t.finalDueDate}=${t.receiptDate}+60)`,
    ),
    check(
      "wholesale_schedule_version_check",
      sql`${t.planVersion}='wholesale-installments-v1'`,
    ),
    check(
      "wholesale_schedule_principal_check",
      sql`${t.principal}>0 AND ${t.principal}<=9999999999.99`,
    ),
    check(
      "wholesale_schedule_receipt_check",
      sql`${t.receiptDate}=(${t.receivedAt} AT TIME ZONE 'Asia/Manila')::date`,
    ),
  ],
);

export const wholesaleInstallmentsTable = pgTable(
  "wholesale_installments",
  {
    arId: uuid("ar_id")
      .notNull()
      .references(() => wholesaleInstallmentSchedulesTable.arId, {
        onDelete: "restrict",
      }),
    sequenceNumber: integer("sequence_number").notNull(),
    dueDate: date("due_date").notNull(),
    amount: money("amount").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.arId, t.sequenceNumber] }),
    check(
      "wholesale_installment_sequence_check",
      sql`${t.sequenceNumber} BETWEEN 1 AND 8`,
    ),
    check(
      "wholesale_installment_amount_check",
      sql`${t.amount}>=0 AND ${t.amount}<=9999999999.99`,
    ),
    index("idx_wholesale_installments_due").on(t.dueDate, t.arId),
  ],
);

export const wholesalePaymentAllocationsTable = pgTable(
  "wholesale_payment_allocations",
  {
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => wholesaleCollectionsTable.id, { onDelete: "restrict" }),
    arId: uuid("ar_id").notNull(),
    sequenceNumber: integer("sequence_number").notNull(),
    amount: money("amount").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.paymentId, t.sequenceNumber] }),
    foreignKey({
      name: "wholesale_allocation_payment_ar_fk",
      columns: [t.paymentId, t.arId],
      foreignColumns: [arPaymentsTable.id, arPaymentsTable.arId],
    }).onDelete("restrict"),
    foreignKey({
      name: "wholesale_allocation_installment_fk",
      columns: [t.arId, t.sequenceNumber],
      foreignColumns: [
        wholesaleInstallmentsTable.arId,
        wholesaleInstallmentsTable.sequenceNumber,
      ],
    }).onDelete("restrict"),
    check(
      "wholesale_allocation_amount_check",
      sql`${t.amount}>0 AND ${t.amount}<=9999999999.99`,
    ),
    index("idx_wholesale_allocations_installment").on(t.arId, t.sequenceNumber),
  ],
);
