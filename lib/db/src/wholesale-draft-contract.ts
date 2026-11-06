import type { CatalogQuery, inspectSchema } from "./readiness";

export async function assertWholesaleDraftReady(
  query: CatalogQuery,
  actual: Awaited<ReturnType<typeof inspectSchema>>,
  namespace: string,
  existingTablesOnly: boolean,
  issues: string[],
) {
  const columns = [
    ["products", "wholesale_price", "numeric(12,2)", false],
    ["wholesale_orders", "order_number", "character varying(100)", false],
    ["wholesale_orders", "draft_revision", "integer", false],
    ["wholesale_orders", "created_by", "uuid", false],
    ["wholesale_operations", "id", "uuid", true],
    ["wholesale_operations", "actor_id", "uuid", true],
    ["wholesale_operations", "payload", "jsonb", true],
    ["wholesale_operations", "result", "jsonb", false],
    ["wholesale_operations", "created_at", "timestamp with time zone", true],
  ] as const;
  for (const [table, name, type, required] of columns) {
    if (
      existingTablesOnly &&
      !actual.tables.some((item) => item.name === table)
    )
      continue;
    const found = actual.columns.find(
      (column) => column.table_name === table && column.name === name,
    );
    const defaultValue = name === "created_at" ? "now()" : null;
    if (
      !found ||
      found.type !== type ||
      found.not_null !== required ||
      found.default_value !== defaultValue
    ) {
      issues.push(
        "missing/incompatible wholesale column " + table + "." + name,
      );
    }
  }
  const constraints = [
    [
      "products",
      "products_wholesale_price_check",
      "CHECK (wholesale_price >= 0::numeric)",
    ],
    [
      "wholesale_orders",
      "wholesale_orders_order_number_key",
      "UNIQUE (order_number)",
    ],
    [
      "wholesale_orders",
      "wholesale_draft_revision_check",
      "CHECK (draft_revision IS NULL OR draft_revision > 0 AND order_number IS NOT NULL AND created_by IS NOT NULL)",
    ],
    [
      "wholesale_orders",
      "wholesale_orders_created_by_fkey",
      "FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT",
    ],
    ["wholesale_operations", "wholesale_operations_pkey", "PRIMARY KEY (id)"],
    [
      "wholesale_operations",
      "wholesale_operations_actor_id_fkey",
      "FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE RESTRICT",
    ],
  ] as const;
  for (const [table, name, definition] of constraints) {
    if (
      existingTablesOnly &&
      !actual.tables.some((item) => item.name === table)
    )
      continue;
    const found = actual.constraints.find(
      (constraint) =>
        constraint.table_name === table && constraint.name === name,
    );
    if (!found || !found.validated || found.definition !== definition) {
      issues.push("missing/incompatible wholesale constraint " + name);
    }
    if (
      [
        "wholesale_orders_order_number_key",
        "wholesale_operations_pkey",
      ].includes(name)
    ) {
      const index = actual.indexes.find(
        (item) => item.table_name === table && item.name === name,
      );
      if (!index || !index.valid || !index.ready)
        issues.push("invalid wholesale index " + name);
    }
  }
  const {
    rows: [sequence],
  } = await query(
    `SELECT s.* FROM pg_sequence s JOIN pg_class c ON c.oid=s.seqrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relname='wholesale_order_number_seq'`,
    [namespace],
  );
  if (
    !sequence ||
    Number(sequence.seqtypid) !== 20 ||
    String(sequence.seqincrement) !== "1" ||
    String(sequence.seqmin) !== "1" ||
    String(sequence.seqmax) !== "9223372036854775807" ||
    sequence.seqcycle
  ) {
    issues.push("missing/incompatible wholesale order sequence");
  }
}
