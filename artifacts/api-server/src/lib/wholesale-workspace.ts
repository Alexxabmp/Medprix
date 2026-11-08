import { WholesaleError, type WholesaleQuery } from "./wholesale-operations";

function paging(search: unknown, page: unknown) {
  if (
    typeof search !== "string" ||
    search.length > 200 ||
    !/^\d{1,6}$/.test(String(page)) ||
    Number(page) < 1
  ) {
    throw new WholesaleError(400, "Choose a valid search and page.");
  }
  return {
    search: search.trim(),
    page: Number(page),
    offset: (Number(page) - 1) * 50,
  };
}

export function createWholesaleWorkspace(read: WholesaleQuery) {
  return {
    async pendingOrders(search: unknown = "", page: unknown = "1") {
      const values = paging(search, page);
      const where = `FROM wholesale_orders o JOIN wholesale_clients c ON c.id=o.client_id
        WHERE o.draft_revision IS NOT NULL AND o.status IN ('Pending','Confirmed','Processing')
        AND strpos(lower(o.order_number || ' ' || coalesce(o.confirmation_snapshot->>'clientName',c.client_name)),lower($1))>0`;
      const {
        rows: [count],
      } = await read("SELECT count(*)::int AS total " + where, [values.search]);
      const { rows: items } = await read(
        `SELECT o.id,o.order_number AS "orderNumber",
        coalesce(o.confirmation_snapshot->>'clientName',c.client_name) AS "clientName",
        o.status,o.total_order_amount::text AS total ${where}
        ORDER BY o.order_date,o.id LIMIT 50 OFFSET $2`,
        [values.search, values.offset],
      );
      return { items, total: count.total, page: values.page, pageSize: 50 };
    },
    async deliveries(
      search: unknown = "",
      page: unknown = "1",
      status: unknown = "active",
    ) {
      const values = paging(search, page);
      if (
        typeof status !== "string" ||
        ![
          "active",
          "all",
          "Scheduled",
          "InTransit",
          "Completed",
          "Failed",
          "Cancelled",
        ].includes(status)
      ) {
        throw new WholesaleError(400, "Choose a valid delivery status.");
      }
      const where = `FROM delivery_schedules d JOIN wholesale_orders o ON o.id=d.order_id
        WHERE d.managed_by IS NOT NULL
        AND ($2='all' OR ($2='active' AND d.status IN ('Scheduled','InTransit')) OR d.status::text=$2)
        AND strpos(lower(o.order_number || ' ' || (o.confirmation_snapshot->>'clientName')),lower($1))>0`;
      const {
        rows: [count],
      } = await read("SELECT count(*)::int AS total " + where, [
        values.search,
        status,
      ]);
      const { rows: items } = await read(
        `SELECT d.id,o.id AS "orderId",o.order_number AS "orderNumber",
        o.confirmation_snapshot->>'clientName' AS "clientName",d.scheduled_date::text AS date,d.status,d.notes
        ${where} ORDER BY CASE WHEN d.status IN ('Scheduled','InTransit') THEN 0 ELSE 1 END,
        d.scheduled_date,d.created_at,d.id LIMIT 50 OFFSET $3`,
        [values.search, status, values.offset],
      );
      return { items, total: count.total, page: values.page, pageSize: 50 };
    },
  };
}
