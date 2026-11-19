import {
  CUSTOMER_DISCOUNTS,
  MAX_USUAL_ITEMS,
  cleanCustomerIdNumber,
  cleanCustomerMobile,
  cleanCustomerName,
  customerIdNumberError,
  customerMobileError,
  customerNameError,
  type CustomerDiscount,
} from "@workspace/api-zod";
import { writeAuditEvent, type AuditActor } from "./audit-events";
import type { Query } from "./atomic-checkout";

/** Returning customers and their usual orders (Phase 2a). Everything here runs in one transaction per call. */
export class CustomerError extends Error {
  constructor(public status: number, message: string, public details: Record<string, unknown> = {}) {
    super(message);
  }
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Actor = AuditActor & { deviceIp?: string };
type Transaction = <T>(work: (query: Query) => Promise<T>) => Promise<T>;
type UsualItem = { productId: string; quantity: number };

const CUSTOMER_SELECT = `SELECT c.id,c.customer_name,c.discount_type,c.id_number,c.contact_number,c.consent_at,c.created_at,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('productId',u.product_id,'quantity',u.quantity) ORDER BY u.created_at,u.product_id)
    FROM customer_usual_items u WHERE u.customer_id=c.id),'[]'::jsonb) AS usual_items,
  (SELECT count(*)::int FROM transactions t WHERE t.customer_id=c.id AND t.status='Completed') AS visit_count,
  (SELECT max(t.transaction_date) FROM transactions t WHERE t.customer_id=c.id AND t.status='Completed') AS last_visit_at
  FROM customers c`;

function toApiCustomer(row: any) {
  return {
    id: row.id,
    name: row.customer_name,
    discountType: (CUSTOMER_DISCOUNTS as string[]).includes(row.discount_type) ? row.discount_type : "Regular",
    idNumber: row.id_number ?? null,
    mobile: row.contact_number ?? null,
    consentAt: row.consent_at ?? null,
    createdAt: row.created_at,
    usualItems: (row.usual_items ?? []) as UsualItem[],
    /** Completed sales linked to this customer (voided sales don't count). */
    visitCount: Number(row.visit_count ?? 0),
    lastVisitAt: row.last_visit_at ?? null,
  };
}

/** Validates a usual order: known products, no controlled drugs, whole quantities, no repeats. */
async function checkUsualItems(query: Query, raw: unknown): Promise<UsualItem[]> {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new CustomerError(400, "The usual order must be a list of medicines.");
  if (raw.length > MAX_USUAL_ITEMS) throw new CustomerError(400, `A usual order can have at most ${MAX_USUAL_ITEMS} medicines.`);
  const items: UsualItem[] = raw.map((item: any) => ({ productId: String(item?.productId ?? ""), quantity: Number(item?.quantity) }));
  const seen = new Set<string>();
  for (const item of items) {
    if (!uuid.test(item.productId)) throw new CustomerError(400, "A medicine in the usual order is not valid.");
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 100000)
      throw new CustomerError(400, "Usual order quantities must be whole numbers from 1 to 100,000.");
    if (seen.has(item.productId)) throw new CustomerError(400, "A medicine appears twice in the usual order.");
    seen.add(item.productId);
  }
  if (!items.length) return items;
  const products = (await query("SELECT id,product_name,is_dangerous_drug FROM products WHERE id=ANY($1::uuid[])", [items.map((item) => item.productId)])).rows;
  if (products.length !== items.length) throw new CustomerError(409, "A medicine in the usual order no longer exists. Reload and try again.");
  const controlled = products.filter((product) => product.is_dangerous_drug).map((product) => product.product_name);
  if (controlled.length)
    throw new CustomerError(400, `Controlled drugs need a new prescription every time and can't be saved in a usual order: ${controlled.join(", ")}.`, { code: "controlled_drug" });
  return items;
}

/** Name, mobile, discount and ID number, cleaned and checked (used when creating and editing). */
function checkDetails(body: any) {
  const name = cleanCustomerName(body?.name);
  const mobile = cleanCustomerMobile(body?.mobile);
  const discountType = String(body?.discountType ?? "Regular") as CustomerDiscount;
  if (!CUSTOMER_DISCOUNTS.includes(discountType)) throw new CustomerError(400, "Choose None, Senior or PWD for the discount.");
  const idNumber = discountType === "Regular" ? "" : cleanCustomerIdNumber(body?.idNumber);
  const problem = customerNameError(name) ?? customerMobileError(mobile) ?? customerIdNumberError(discountType, idNumber);
  if (problem) throw new CustomerError(400, problem);
  return { name, mobile, discountType, idNumber };
}

/** One profile per Senior/PWD ID number (spaces and dashes ignored), so the same person isn't saved twice. */
async function checkIdNotTaken(query: Query, idNumber: string, exceptId: string | null) {
  if (!idNumber) return;
  await query("SELECT pg_advisory_xact_lock(hashtextextended('medprix:customers',0))");
  const [existing] = (await query(
    `SELECT customer_name FROM customers
     WHERE upper(regexp_replace(id_number,'[\\s-]','','g'))=upper(regexp_replace($1,'[\\s-]','','g')) AND ($2::uuid IS NULL OR id<>$2) LIMIT 1`,
    [idNumber, exceptId],
  )).rows;
  if (existing)
    throw new CustomerError(409, `A customer with this ID number is already saved: ${existing.customer_name}. Find them instead.`, { code: "customer_exists" });
}

async function writeUsualItems(query: Query, customerId: string, items: UsualItem[]) {
  await query("DELETE FROM customer_usual_items WHERE customer_id=$1", [customerId]);
  for (const item of items)
    await query("INSERT INTO customer_usual_items(customer_id,product_id,quantity) VALUES($1,$2,$3)", [customerId, item.productId, item.quantity]);
}

export function createCustomerStore(transaction: Transaction, read: Query) {
  return {
    /** Every customer with their usual order; the POS searches this list as the cashier types. */
    async list() {
      return (await read(`${CUSTOMER_SELECT} ORDER BY lower(c.customer_name),c.id LIMIT 2000`)).rows.map(toApiCustomer);
    },

    async create(body: any, actor: Actor) {
      const { name, mobile, discountType, idNumber } = checkDetails(body);
      if (body?.consent !== true)
        throw new CustomerError(400, "The customer's consent is needed before their details and usual medicines can be saved.", { code: "consent_required" });
      return transaction(async (query) => {
        await checkIdNotTaken(query, idNumber, null);
        const items = await checkUsualItems(query, body?.usualItems);
        const [row] = (await query(
          `INSERT INTO customers(customer_name,discount_type,id_number,contact_number,consent_at,consent_recorded_by)
           VALUES($1,$2,$3,$4,now(),$5) RETURNING id`,
          [name, discountType, idNumber || null, mobile || null, actor.id],
        )).rows;
        await writeUsualItems(query, row.id, items);
        await writeAuditEvent(query, {
          actor, action: "Customer Created", activity: "Saved returning customer", module: "POS",
          description: `Saved returning customer ${name} with ${items.length} usual item(s); consent recorded`, deviceIp: actor.deviceIp,
        });
        return toApiCustomer((await query(`${CUSTOMER_SELECT} WHERE c.id=$1`, [row.id])).rows[0]);
      });
    },

    /** Phase 2b: edits name, mobile, discount and ID number. Consent and the usual order are unchanged. */
    async update(customerId: string, body: any, actor: Actor) {
      if (!uuid.test(customerId)) throw new CustomerError(404, "This customer was not found.");
      const { name, mobile, discountType, idNumber } = checkDetails(body);
      return transaction(async (query) => {
        const [customer] = (await query("SELECT id FROM customers WHERE id=$1 FOR UPDATE", [customerId])).rows;
        if (!customer) throw new CustomerError(404, "This customer was not found. They may have been deleted.");
        await checkIdNotTaken(query, idNumber, customerId);
        await query(
          "UPDATE customers SET customer_name=$2,discount_type=$3,id_number=$4,contact_number=$5,updated_at=now() WHERE id=$1",
          [customerId, name, discountType, idNumber || null, mobile || null],
        );
        await writeAuditEvent(query, {
          actor, action: "Customer Updated", activity: "Edited customer details", module: "POS",
          description: `Edited details of returning customer ${name}`, deviceIp: actor.deviceIp,
        });
        return toApiCustomer((await query(`${CUSTOMER_SELECT} WHERE c.id=$1`, [customerId])).rows[0]);
      });
    },

    /**
     * Phase 2b: deletes the profile and usual order (for example when the customer withdraws consent).
     * Past sales stay: their link to the profile is cleared by the database, and their Senior/PWD
     * name and ID remain on the discount record, which BIR requires to be kept.
     */
    async remove(customerId: string, actor: Actor) {
      if (!uuid.test(customerId)) throw new CustomerError(404, "This customer was not found.");
      return transaction(async (query) => {
        const [customer] = (await query("SELECT id,customer_name FROM customers WHERE id=$1 FOR UPDATE", [customerId])).rows;
        if (!customer) throw new CustomerError(404, "This customer was already deleted.");
        await query("DELETE FROM customers WHERE id=$1", [customerId]);
        await writeAuditEvent(query, {
          actor, action: "Customer Deleted", activity: "Deleted customer profile", module: "POS",
          description: `Deleted returning customer ${customer.customer_name} and their usual order; past sales kept`, deviceIp: actor.deviceIp,
        });
        return { id: customerId, deleted: true };
      });
    },

    /** Replaces the whole usual order (from "Save cart as usual order" or the profile panel). */
    async replaceUsualItems(customerId: string, body: any, actor: Actor) {
      if (!uuid.test(customerId)) throw new CustomerError(404, "This customer was not found.");
      return transaction(async (query) => {
        const [customer] = (await query("SELECT id,customer_name FROM customers WHERE id=$1 FOR UPDATE", [customerId])).rows;
        if (!customer) throw new CustomerError(404, "This customer was not found. They may have been deleted.");
        const items = await checkUsualItems(query, body?.usualItems);
        await writeUsualItems(query, customerId, items);
        await query("UPDATE customers SET updated_at=now() WHERE id=$1", [customerId]);
        await writeAuditEvent(query, {
          actor, action: "Customer Usual Order Updated", activity: "Updated usual order", module: "POS",
          description: `Updated usual order of ${customer.customer_name} to ${items.length} item(s)`, deviceIp: actor.deviceIp,
        });
        return toApiCustomer((await query(`${CUSTOMER_SELECT} WHERE c.id=$1`, [customerId])).rows[0]);
      });
    },
  };
}
