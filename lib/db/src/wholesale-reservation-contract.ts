import type { CatalogQuery, inspectSchema } from "./readiness";

export async function assertWholesaleReservationsReady(
  query: CatalogQuery,
  actual: Awaited<ReturnType<typeof inspectSchema>>,
  namespace: string,
  existingTablesOnly: boolean,
  issues: string[],
) {
  const columns = [
    ["wholesale_orders", "confirmation_snapshot", "jsonb", false],
    ["wholesale_orders", "confirmed_at", "timestamp with time zone", false],
    ["wholesale_orders", "confirmed_by", "uuid", false],
    ["wholesale_orders", "cancelled_at", "timestamp with time zone", false],
    ["wholesale_orders", "cancelled_by", "uuid", false],
    ["wholesale_price_overrides", "id", "uuid", true],
    ["wholesale_price_overrides", "order_id", "uuid", true],
    ["wholesale_price_overrides", "product_id", "uuid", true],
    ["wholesale_price_overrides", "order_revision", "integer", true],
    ["wholesale_price_overrides", "binding", "jsonb", true],
    ["wholesale_price_overrides", "requested_price", "numeric(12,2)", true],
    ["wholesale_price_overrides", "reason", "text", true],
    ["wholesale_price_overrides", "requested_by", "uuid", true],
    [
      "wholesale_price_overrides",
      "requested_at",
      "timestamp with time zone",
      true,
    ],
    ["wholesale_price_overrides", "approved_by", "uuid", false],
    [
      "wholesale_price_overrides",
      "approved_at",
      "timestamp with time zone",
      false,
    ],
    ["wholesale_price_overrides", "approval_reason", "text", false],
    ["wholesale_reservations", "id", "uuid", true],
    ["wholesale_reservations", "order_id", "uuid", true],
    ["wholesale_reservations", "order_item_id", "uuid", true],
    ["wholesale_reservations", "batch_id", "uuid", true],
    [
      "wholesale_reservations",
      "batch_number_at_reservation",
      "character varying(100)",
      true,
    ],
    ["wholesale_reservations", "expiry_at_reservation", "date", true],
    ["wholesale_reservations", "quantity", "integer", true],
    ["wholesale_reservations", "reserved_by", "uuid", true],
    ["wholesale_reservations", "reserved_at", "timestamp with time zone", true],
    ["wholesale_reservations", "released_by", "uuid", false],
    [
      "wholesale_reservations",
      "released_at",
      "timestamp with time zone",
      false,
    ],
    [
      "wholesale_reservations",
      "consumed_at",
      "timestamp with time zone",
      false,
    ],
  ] as const;
  for (const [table, name, type, required] of columns) {
    if (
      existingTablesOnly &&
      !actual.tables.some((item) => item.name === table)
    )
      continue;
    const column = actual.columns.find(
      (item) => item.table_name === table && item.name === name,
    );
    const expectedDefault =
      name === "id"
        ? "gen_random_uuid()"
        : ["reserved_at", "requested_at"].includes(name)
          ? "now()"
          : null;
    if (
      !column ||
      column.type !== type ||
      column.not_null !== required ||
      column.default_value !== expectedDefault
    ) {
      issues.push(
        "missing/incompatible reservation column " + table + "." + name,
      );
    }
  }
  for (const table of ["wholesale_price_overrides", "wholesale_reservations"]) {
    if (
      existingTablesOnly &&
      !actual.tables.some((item) => item.name === table)
    )
      continue;
    for (const field of table === "wholesale_reservations"
      ? ["order_id", "order_item_id", "batch_id", "reserved_by", "released_by"]
      : ["order_id", "product_id", "requested_by", "approved_by"]) {
      const fk = actual.constraints.find(
        (item) =>
          item.table_name === table &&
          item.type === "f" &&
          item.definition.startsWith("FOREIGN KEY (" + field + ")") &&
          item.definition.endsWith("ON DELETE RESTRICT"),
      );
      if (!fk || !fk.validated)
        issues.push("missing restrictive reference " + table + "." + field);
    }
    const primary = actual.constraints.find(
      (item) =>
        item.table_name === table &&
        item.type === "p" &&
        item.definition === "PRIMARY KEY (id)",
    );
    if (!primary?.validated) issues.push("missing primary key " + table);
  }
  for (const name of [
    "wholesale_confirmation_check",
    "wholesale_price_overrides_requested_price_check",
    "wholesale_price_overrides_reason_check",
    "wholesale_price_overrides_check",
    "wholesale_reservations_quantity_check",
    "wholesale_reservations_check",
    "wholesale_reservations_check1",
    "wholesale_reservations_order_item_id_batch_id_key",
  ]) {
    if (
      !actual.constraints.some((item) => item.name === name && item.validated)
    )
      issues.push("missing reservation constraint " + name);
  }
  for (const name of [
    "idx_wholesale_reservations_active_batch",
    "idx_wholesale_reservations_order",
    "idx_wholesale_overrides_order",
  ]) {
    const index = actual.indexes.find((item) => item.name === name);
    if (!index?.valid || !index.ready)
      issues.push("missing/incompatible reservation index " + name);
  }
  const trigger = actual.triggers.find(
    (item) =>
      item.table_name === "batch_info" &&
      item.name === "protect_wholesale_reserved_batch",
  );
  if (
    !trigger ||
    trigger.enabled !== "O" ||
    !trigger.definition.includes(
      "BEFORE UPDATE OF quantity_remaining, expiration_date, product_id, batch_number",
    )
  ) {
    issues.push("missing/incompatible reservation batch guard");
  }
  const {
    rows: [fn],
  } = await query(
    `SELECT p.prosrc,p.prosecdef,l.lanname,p.prorettype='trigger'::regtype AS trigger
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang
      WHERE n.nspname=$1 AND p.proname='protect_wholesale_reserved_batch' AND p.pronargs=0`,
    [namespace],
  );
  if (
    !fn ||
    fn.prosecdef ||
    !fn.trigger ||
    fn.lanname !== "plpgsql" ||
    !fn.prosrc.includes("NEW.quantity_remaining < reserved") ||
    !fn.prosrc.includes("released_at IS NULL AND consumed_at IS NULL") ||
    !fn.prosrc.includes(
      "NEW.expiration_date IS DISTINCT FROM OLD.expiration_date",
    )
  ) {
    issues.push("missing/incompatible reservation guard function");
  }
}
