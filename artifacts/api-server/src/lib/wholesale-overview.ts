import { WholesaleError, type WholesaleQuery } from "./wholesale-operations";
import type { AuditActor } from "./audit-events";

export const wholesaleBusinessDay = "(now() AT TIME ZONE 'Asia/Manila')::date";
export const wholesaleOverdue = `a.balance > 0 AND a.due_date < ${wholesaleBusinessDay}`;
export const wholesalePaymentStatus = `CASE WHEN a.balance <= 0 THEN 'Paid' WHEN ${wholesaleOverdue} THEN 'Overdue' ELSE 'Outstanding' END`;

export function createWholesaleOverview(read: WholesaleQuery) {
  return async (actor: AuditActor) => {
    if (!["Admin", "FrontDesk"].includes(actor.role)) {
      throw new WholesaleError(
        403,
        "Wholesale overview access is restricted to Admin and FrontDesk.",
      );
    }
    const {
      rows: [overview],
    } = await read(`WITH active_orders AS (
      SELECT o.id,o.order_number AS "orderNumber",
        coalesce(o.confirmation_snapshot->>'clientName',c.client_name) AS "clientName",
        o.status,o.total_order_amount::text AS total,o.order_date
      FROM wholesale_orders o JOIN wholesale_clients c ON c.id=o.client_id
      WHERE o.draft_revision IS NOT NULL AND o.status IN ('Pending','Confirmed','Processing')
    ), accounts AS (
      SELECT a.id,o.order_number AS "orderNumber",f.snapshot->>'clientName' AS "clientName",
        a.balance,a.due_date AS "dueDate",${wholesalePaymentStatus} AS status
      FROM accounts_receivable a JOIN wholesale_fulfillments f ON f.ar_id=a.id
      JOIN wholesale_orders o ON o.id=a.order_id
    ) SELECT ${wholesaleBusinessDay}::text AS today,
      (SELECT count(*)::int FROM active_orders) AS "openOrders",
      (SELECT count(*)::int FROM active_orders WHERE status='Pending') AS drafts,
      (SELECT coalesce(sum(balance),0)::numeric(16,2)::text FROM accounts WHERE balance>0) AS outstanding,
      (SELECT coalesce(sum(balance),0)::numeric(16,2)::text FROM accounts WHERE status='Overdue') AS overdue,
      (SELECT count(*)::int FROM accounts WHERE status='Overdue') AS "overdueCount",
      (SELECT count(*)::int FROM delivery_schedules WHERE managed_by IS NOT NULL AND status IN ('Scheduled','InTransit')) AS "activeDeliveries"
`);
    return overview;
  };
}
