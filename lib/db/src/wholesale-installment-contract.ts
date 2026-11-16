import type { CatalogQuery, inspectSchema } from "./readiness";

/** Catalog-only verification. Never creates tables or opens the application DB. */
export async function assertWholesaleInstallmentsReady(
  query: CatalogQuery,
  actual: Awaited<ReturnType<typeof inspectSchema>>,
  namespace: string,
  existingTablesOnly: boolean,
  issues: string[],
) {
  const columns = [
    ["wholesale_orders", "payment_plan", "wholesale_payment_plan_enum", false, null],
    [
      "delivery_schedules",
      "dispatched_at",
      "timestamp with time zone",
      false,
      null,
    ],
    [
      "wholesale_fulfillments",
      "received_at",
      "timestamp with time zone",
      false,
      null,
    ],
    [
      "wholesale_fulfillments",
      "recorded_at",
      "timestamp with time zone",
      true,
      "now()",
    ],
    ["wholesale_installment_schedules", "ar_id", "uuid", true, null],
    [
      "wholesale_installment_schedules",
      "payment_plan",
      "wholesale_payment_plan_enum",
      true,
      null,
    ],
    [
      "wholesale_installment_schedules",
      "plan_version",
      "character varying(32)",
      true,
      null,
    ],
    [
      "wholesale_installment_schedules",
      "principal",
      "numeric(12,2)",
      true,
      null,
    ],
    [
      "wholesale_installment_schedules",
      "installment_count",
      "integer",
      true,
      null,
    ],
    [
      "wholesale_installment_schedules",
      "received_at",
      "timestamp with time zone",
      true,
      null,
    ],
    ["wholesale_installment_schedules", "receipt_date", "date", true, null],
    ["wholesale_installment_schedules", "final_due_date", "date", true, null],
    [
      "wholesale_installment_schedules",
      "generated_at",
      "timestamp with time zone",
      true,
      "now()",
    ],
    ["wholesale_installments", "ar_id", "uuid", true, null],
    ["wholesale_installments", "sequence_number", "integer", true, null],
    ["wholesale_installments", "due_date", "date", true, null],
    ["wholesale_installments", "amount", "numeric(12,2)", true, null],
    ["wholesale_payment_allocations", "payment_id", "uuid", true, null],
    ["wholesale_payment_allocations", "ar_id", "uuid", true, null],
    ["wholesale_payment_allocations", "sequence_number", "integer", true, null],
    ["wholesale_payment_allocations", "amount", "numeric(12,2)", true, null],
  ] as const;
  const absent = (table: string) =>
    existingTablesOnly && !actual.tables.some((row) => row.name === table);
  for (const [table, name, type, required, fallback] of columns) {
    if (absent(table)) continue;
    const found = actual.columns.find(
      (row) => row.table_name === table && row.name === name,
    );
    if (
      !found ||
      found.type !== type ||
      found.not_null !== required ||
      found.default_value !== fallback
    )
      issues.push(`missing/incompatible installment column ${table}.${name}`);
  }
  const planEnum = actual.enums.find((row) => row.name === "wholesale_payment_plan_enum");
  if (!planEnum || JSON.stringify(planEnum.labels) !== JSON.stringify(["Net30", "Net60"]))
    issues.push("missing/incompatible enum wholesale_payment_plan_enum");
  const constraints = [
    ["wholesale_orders", "wholesale_confirmed_agreement_check", "c"],
    ["accounts_receivable", "wholesale_ar_balance_equation_check", "c"],
    ["ar_payments", "wholesale_payment_id_ar_key", "u"],
    ["wholesale_installment_schedules", "wholesale_schedule_plan_check", "c"],
    [
      "wholesale_installment_schedules",
      "wholesale_schedule_version_check",
      "c",
    ],
    [
      "wholesale_installment_schedules",
      "wholesale_schedule_principal_check",
      "c",
    ],
    [
      "wholesale_installment_schedules",
      "wholesale_schedule_receipt_check",
      "c",
    ],
    ["wholesale_installments", "wholesale_installment_sequence_check", "c"],
    ["wholesale_installments", "wholesale_installment_amount_check", "c"],
    ["wholesale_payment_allocations", "wholesale_allocation_amount_check", "c"],
  ];
  for (const [table, name, type] of constraints) {
    if (
      !absent(table) &&
      !actual.constraints.some(
        (row) =>
          row.table_name === table &&
          row.name === name &&
          row.type === type &&
          row.validated,
      )
    )
      issues.push("missing installment constraint " + name);
  }
  const references = [
    [
      "wholesale_installment_schedules",
      "FOREIGN KEY (ar_id)",
      "wholesale_fulfillments(ar_id)",
    ],
    [
      "wholesale_installments",
      "FOREIGN KEY (ar_id)",
      "wholesale_installment_schedules(ar_id)",
    ],
    [
      "wholesale_payment_allocations",
      "FOREIGN KEY (payment_id)",
      "wholesale_collections(id)",
    ],
    [
      "wholesale_payment_allocations",
      "FOREIGN KEY (payment_id, ar_id)",
      "ar_payments(id, ar_id)",
    ],
    [
      "wholesale_payment_allocations",
      "FOREIGN KEY (ar_id, sequence_number)",
      "wholesale_installments(ar_id, sequence_number)",
    ],
  ];
  for (const [table, prefix, target] of references) {
    if (
      !absent(table) &&
      !actual.constraints.some(
        (row) =>
          row.table_name === table &&
          row.type === "f" &&
          row.validated &&
          row.definition.startsWith(prefix) &&
          row.definition.includes(target) &&
          row.definition.endsWith("ON DELETE RESTRICT"),
      )
    )
      issues.push(
        `missing restrictive installment reference ${table}: ${prefix}`,
      );
  }
  for (const [table, key] of [
    ["wholesale_installment_schedules", "PRIMARY KEY (ar_id)"],
    ["wholesale_installments", "PRIMARY KEY (ar_id, sequence_number)"],
    [
      "wholesale_payment_allocations",
      "PRIMARY KEY (payment_id, sequence_number)",
    ],
  ]) {
    if (
      !absent(table) &&
      !actual.constraints.some(
        (row) =>
          row.table_name === table &&
          row.type === "p" &&
          row.validated &&
          row.definition === key,
      )
    )
      issues.push("missing installment primary key " + table);
  }
  for (const [table, name, deferred] of [
    ["wholesale_orders", "protect_wholesale_agreement", false],
    ["wholesale_installment_schedules", "protect_wholesale_schedule", false],
    ["wholesale_installments", "protect_wholesale_installments", false],
    ["wholesale_payment_allocations", "protect_wholesale_allocations", false],
    [
      "wholesale_installment_schedules",
      "validate_wholesale_schedule_header",
      true,
    ],
    ["wholesale_installments", "validate_wholesale_schedule_rows", true],
  ] as const) {
    if (absent(table)) continue;
    const trigger = actual.triggers.find(
      (row) => row.table_name === table && row.name === name,
    );
    if (
      !trigger ||
      trigger.enabled !== "O" ||
      (deferred
        ? !trigger.definition.includes("DEFERRABLE INITIALLY DEFERRED") ||
          !trigger.definition.includes("AFTER INSERT")
        : !trigger.definition.includes("BEFORE DELETE OR UPDATE"))
    )
      issues.push("missing/incompatible installment guard " + name);
  }
  for (const [table, name] of [
    ["wholesale_installments", "idx_wholesale_installments_due"],
    ["wholesale_payment_allocations", "idx_wholesale_allocations_installment"],
  ]) {
    if (
      !absent(table) &&
      !actual.indexes.some(
        (row) =>
          row.table_name === table &&
          row.name === name &&
          row.valid &&
          row.ready,
      )
    )
      issues.push("missing installment index " + name);
  }
  const receivableGuard = actual.triggers.find(
    (row) =>
      row.table_name === "accounts_receivable" &&
      row.name === "protect_wholesale_receivable_terms",
  );
  if (
    !absent("accounts_receivable") &&
    (!receivableGuard ||
      receivableGuard.enabled !== "O" ||
      !receivableGuard.definition.includes("BEFORE UPDATE"))
  )
    issues.push(
      "missing/incompatible installment guard protect_wholesale_receivable_terms",
    );
  const { rows: functions } = await query(
    "SELECT p.proname,p.prosrc,p.prosecdef,l.lanname,p.prorettype='trigger'::regtype AS returns_trigger FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang WHERE n.nspname=$1 AND p.proname=ANY($2::text[]) AND p.pronargs=0",
    [
      namespace,
      [
        "protect_wholesale_agreement",
        "protect_wholesale_receivable_terms",
        "protect_wholesale_installment_history",
        "validate_wholesale_schedule",
      ],
    ],
  );
  for (const [name, marker] of [
    [
      "protect_wholesale_agreement",
      "Confirmed wholesale agreement is immutable",
    ],
    [
      "protect_wholesale_receivable_terms",
      "Posted wholesale receivable terms are immutable",
    ],
    [
      "protect_wholesale_installment_history",
      "Wholesale installment history is immutable",
    ],
    [
      "validate_wholesale_schedule",
      "Wholesale installment schedule is incomplete or inconsistent",
    ],
  ]) {
    const fn = functions.find((row) => row.proname === name);
    if (
      !fn ||
      fn.prosecdef ||
      fn.lanname !== "plpgsql" ||
      !fn.returns_trigger ||
      !fn.prosrc.includes(marker)
    )
      issues.push("missing/incompatible installment function " + name);
  }
}
