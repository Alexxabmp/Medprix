import { WholesaleError, type WholesaleQuery } from "./wholesale-operations";
import type { AuditActor } from "./audit-events";
import { pharmacyDate } from "@workspace/api-zod";
import {
  wholesaleCreditJoin,
  wholesalePaymentStatus,
} from "./wholesale-receivable-aging";

export function createWholesaleOverview(
  read: WholesaleQuery,
  clock: () => Date = () => new Date(),
) {
  return async (actor: AuditActor) => {
    if (!["Admin", "FrontDesk"].includes(actor.role)) {
      throw new WholesaleError(
        403,
        "Wholesale overview access is restricted to Admin and FrontDesk.",
      );
    }
    const {
      rows: [overview],
    } = await read(
      `WITH active_orders AS (
      SELECT o.id,o.order_number AS "orderNumber",
        coalesce(o.confirmation_snapshot->>'clientName',c.client_name) AS "clientName",
        o.status,o.total_order_amount::text AS total,o.order_date
      FROM wholesale_orders o JOIN wholesale_clients c ON c.id=o.client_id
      WHERE o.draft_revision IS NOT NULL AND o.status IN ('Pending','Confirmed','Processing')
    ), accounts AS (
      SELECT a.id,o.order_number AS "orderNumber",f.snapshot->>'clientName' AS "clientName",
        a.balance,a.due_date AS "dueDate",${wholesalePaymentStatus} AS status,credit.overdue_amount
      FROM accounts_receivable a JOIN wholesale_fulfillments f ON f.ar_id=a.id
      JOIN wholesale_orders o ON o.id=a.order_id
      ${wholesaleCreditJoin("$1::date")}
    ) SELECT $1::date::text AS today,
      (SELECT count(*)::int FROM active_orders) AS "openOrders",
      (SELECT count(*)::int FROM active_orders WHERE status='Pending') AS drafts,
      (SELECT coalesce(sum(balance),0)::numeric(16,2)::text FROM accounts WHERE balance>0) AS outstanding,
      (SELECT coalesce(sum(overdue_amount),0)::numeric(16,2)::text FROM accounts WHERE status='Overdue') AS overdue,
      (SELECT count(*)::int FROM accounts WHERE status='Overdue') AS "overdueCount",
      (SELECT count(*)::int FROM delivery_schedules WHERE managed_by IS NOT NULL AND status IN ('Scheduled','InTransit')) AS "activeDeliveries",
      -- Confirmed orders whose latest delivery failed and nothing new is scheduled: reschedule, or cancel to free the stock.
      (SELECT coalesce(jsonb_agg(jsonb_build_object('orderId',f.id,'orderNumber',f.order_number,'clientName',f.client_name,
          'failedOn',f.scheduled_date::text,'reason',nullif((regexp_split_to_array(btrim(coalesce(f.notes,''),E' \n'),E'\n'))[cardinality(regexp_split_to_array(btrim(coalesce(f.notes,''),E' \n'),E'\n'))],'')) ORDER BY f.scheduled_date),'[]'::jsonb) FROM (
        SELECT o.id,o.order_number,coalesce(o.confirmation_snapshot->>'clientName',c.client_name) AS client_name,last.scheduled_date,last.notes
        FROM wholesale_orders o JOIN wholesale_clients c ON c.id=o.client_id
        JOIN LATERAL (SELECT d.status,d.scheduled_date,d.notes FROM delivery_schedules d WHERE d.order_id=o.id ORDER BY d.created_at DESC,d.id DESC LIMIT 1) last ON true
        WHERE o.status='Confirmed' AND last.status='Failed'
      ) f) AS "failedDeliveries",
      -- Credit-hold requests waiting for an Admin decision on the order's current revision.
      (SELECT coalesce(jsonb_agg(jsonb_build_object('orderId',o.id,'orderNumber',o.order_number,'requestedAt',c.requested_at) ORDER BY c.requested_at),'[]'::jsonb)
        FROM wholesale_credit_approvals c JOIN wholesale_orders o ON o.id=c.order_id
        WHERE c.decision IS NULL AND o.status='Pending' AND o.draft_revision=c.order_revision) AS "pendingCreditApprovals"
`,
      [pharmacyDate(clock())],
    );
    return overview;
  };
}
