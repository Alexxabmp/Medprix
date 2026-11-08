import type { CatalogQuery, inspectSchema } from "./readiness";

export async function assertWholesaleCollectionsReady(
  query: CatalogQuery,
  actual: Awaited<ReturnType<typeof inspectSchema>>,
  namespace: string,
  existingTablesOnly: boolean,
  issues: string[],
) {
  const tables = {
    wholesale_collections: [
      ["id", "uuid"],
      ["collector_id", "uuid"],
      ["collector_name", "character varying(255)"],
      ["method", "character varying(30)"],
      ["reference", "character varying(255)"],
      ["recorded_at", "timestamp with time zone"],
    ],
    wholesale_collection_reversals: [
      ["id", "uuid"],
      ["collection_id", "uuid"],
      ["reversed_by", "uuid"],
      ["reason", "text"],
      ["reversed_at", "timestamp with time zone"],
    ],
  };
  for (const [table, columns] of Object.entries(tables)) {
    if (existingTablesOnly && !actual.tables.some((row) => row.name === table))
      continue;
    for (const [name, type] of columns) {
      const found = actual.columns.find(
        (row) => row.table_name === table && row.name === name,
      );
      const required = !["reference"].includes(name);
      const fallback =
        name === "id" && table !== "wholesale_collections"
          ? "gen_random_uuid()"
          : ["recorded_at", "reversed_at"].includes(name)
            ? "now()"
            : null;
      if (
        !found ||
        found.type !== type ||
        found.not_null !== required ||
        found.default_value !== fallback
      )
        issues.push(
          "missing/incompatible collection column " + table + "." + name,
        );
    }
    if (
      !actual.constraints.some(
        (row) => row.table_name === table && row.type === "p" && row.validated,
      )
    )
      issues.push("missing collection primary key " + table);
    for (const [name, type] of columns.filter(
      ([name]) =>
        name.endsWith("_id") ||
        (name === "id" && table === "wholesale_collections"),
    )) {
      if (
        !actual.constraints.some(
          (row) =>
            row.table_name === table &&
            row.type === "f" &&
            row.validated &&
            row.definition.startsWith("FOREIGN KEY (" + name + ")") &&
            row.definition.endsWith("ON DELETE RESTRICT"),
        )
      )
        issues.push(
          "missing restrictive collection reference " + table + "." + name,
        );
    }
  }
  for (const name of [
    "protect_wholesale_collections",
    "protect_wholesale_reversals",
    "protect_wholesale_payment",
  ]) {
    const trigger = actual.triggers.find((row) => row.name === name);
    if (!trigger || trigger.enabled !== "O")
      issues.push("missing collection guard " + name);
  }
  for (const name of ["idx_wholesale_collections_collector"]) {
    const index = actual.indexes.find((row) => row.name === name);
    if (!index?.valid || !index.ready)
      issues.push("missing collection index " + name);
  }
  for (const name of [
    "wholesale_collections_method_check",
    "wholesale_collections_check",
    "wholesale_collection_reversals_collection_id_key",
    "wholesale_collection_reversals_reason_check",
  ]) {
    if (!actual.constraints.some((row) => row.name === name && row.validated))
      issues.push("missing collection constraint " + name);
  }
  const { rows } = await query(
    "SELECT p.proname,p.prosrc,p.prosecdef,l.lanname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang WHERE n.nspname=$1 AND p.proname=ANY($2::text[]) AND p.pronargs=0",
    [
      namespace,
      ["protect_wholesale_collection_history", "protect_wholesale_payment"],
    ],
  );
  for (const name of [
    "protect_wholesale_collection_history",
    "protect_wholesale_payment",
  ]) {
    const fn = rows.find((row) => row.proname === name);
    if (
      !fn ||
      fn.prosecdef ||
      fn.lanname !== "plpgsql" ||
      !fn.prosrc.includes("RAISE EXCEPTION")
    )
      issues.push("missing collection guard function " + name);
  }
}
