import type { CatalogQuery, inspectSchema } from "./readiness";

export async function assertWholesaleFulfillmentReady(
  query: CatalogQuery,
  actual: Awaited<ReturnType<typeof inspectSchema>>,
  namespace: string,
  existingTablesOnly: boolean,
  issues: string[],
) {
  const fields = [
    ["delivery_schedules", "managed_by", "uuid", false, null],
    ["wholesale_fulfillments", "id", "uuid", true, "gen_random_uuid()"],
    ...["order_id", "schedule_id", "receipt_id", "ar_id", "delivered_by"].map(
      (name) => ["wholesale_fulfillments", name, "uuid", true, null],
    ),
    ["wholesale_fulfillments", "snapshot", "jsonb", true, null],
    [
      "wholesale_fulfillments",
      "delivered_at",
      "timestamp with time zone",
      true,
      "now()",
    ],
  ];
  for (const [table, name, type, required, fallback] of fields) {
    if (
      existingTablesOnly &&
      !actual.tables.some((item) => item.name === table)
    )
      continue;
    const column = actual.columns.find(
      (item) => item.table_name === table && item.name === name,
    );
    if (
      !column ||
      column.type !== type ||
      column.not_null !== required ||
      column.default_value !== fallback
    )
      issues.push(
        "missing/incompatible fulfillment column " + table + "." + name,
      );
  }
  if (
    !existingTablesOnly ||
    actual.tables.some((item) => item.name === "wholesale_fulfillments")
  ) {
    for (const field of ["order_id", "schedule_id", "receipt_id", "ar_id"]) {
      if (
        !actual.constraints.some(
          (item) =>
            item.table_name === "wholesale_fulfillments" &&
            item.type === "u" &&
            item.validated &&
            item.definition === "UNIQUE (" + field + ")",
        )
      )
        issues.push("missing unique fulfillment " + field);
    }
    for (const field of [
      "order_id",
      "schedule_id",
      "receipt_id",
      "ar_id",
      "delivered_by",
    ]) {
      if (
        !actual.constraints.some(
          (item) =>
            item.table_name === "wholesale_fulfillments" &&
            item.type === "f" &&
            item.validated &&
            item.definition.startsWith("FOREIGN KEY (" + field + ")") &&
            item.definition.endsWith("ON DELETE RESTRICT"),
        )
      )
        issues.push("missing restrictive fulfillment " + field);
    }
    const guard = actual.triggers.find(
      (item) =>
        item.table_name === "wholesale_fulfillments" &&
        item.name === "protect_wholesale_fulfillment",
    );
    if (
      !guard ||
      guard.enabled !== "O" ||
      !guard.definition.includes("BEFORE DELETE OR UPDATE")
    )
      issues.push("missing immutable fulfillment guard");
  }

  const {
    rows: [fn],
  } = await query(
    "SELECT p.prosrc AS body,p.prosecdef AS security_definer,l.lanname AS language,p.prorettype='trigger'::regtype AS returns_trigger FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang WHERE n.nspname=$1 AND p.proname='protect_wholesale_fulfillment' AND p.pronargs=0",
    [namespace],
  );
  if (
    !fn ||
    !fn.returns_trigger ||
    fn.security_definer ||
    fn.language !== "plpgsql" ||
    !fn.body.includes("RAISE EXCEPTION 'Wholesale fulfillment is immutable'")
  )
    issues.push("missing immutable fulfillment function");
  const reference = actual.constraints.find(
    (item) =>
      item.table_name === "delivery_schedules" &&
      item.type === "f" &&
      item.validated &&
      item.definition.startsWith("FOREIGN KEY (managed_by)") &&
      item.definition.endsWith("ON DELETE RESTRICT"),
  );
  if (
    (!existingTablesOnly ||
      actual.tables.some((item) => item.name === "delivery_schedules")) &&
    !reference
  )
    issues.push("missing restrictive delivery actor");
  const index = actual.indexes.find(
    (item) => item.name === "uq_wholesale_active_delivery",
  );
  if (
    (!existingTablesOnly ||
      actual.tables.some((item) => item.name === "delivery_schedules")) &&
    (!index?.valid ||
      !index.ready ||
      !index.definition.includes("managed_by IS NOT NULL"))
  )
    issues.push("missing active delivery uniqueness");
  const { rows } = await query(
    "SELECT seqincrement,seqcycle FROM pg_sequence s JOIN pg_class c ON c.oid=s.seqrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relname='wholesale_delivery_receipt_seq'",
    [namespace],
  );
  if (!rows.length || String(rows[0].seqincrement) !== "1" || rows[0].seqcycle)
    issues.push("missing delivery receipt sequence");
}
