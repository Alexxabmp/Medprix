import { readRetailSales } from "./retail-sale-read-model";
import {
  pharmacyDate,
  calculateRetailLine,
  allocateRetailAmount,
} from "@workspace/api-zod";
import { PaymentError, paymentFromRow } from "./cashier-payments";
import { writeAuditEvent } from "./audit-events";

export type Query = (text: string, params?: any[]) => Promise<{ rows: any[] }>;
export type Transaction = <T>(work: (query: Query) => Promise<T>) => Promise<T>;
export type CheckoutActor = {
  id: string;
  username: string;
  role: string;
  deviceIp?: string;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const maxMoney = 999999999999n;

export class CheckoutError extends PaymentError {
  constructor(
    status: number,
    message: string,
    public details?: { productId?: string; available?: number; code?: string },
  ) {
    super(status, message);
  }
}
export function cents(value: unknown): bigint {
  const text = String(value ?? "")
    .trim()
    .replace(/^₱\s*/, "");
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(text))
    throw new CheckoutError(
      400,
      "Enter a valid money amount with at most two decimal places.",
    );
  const [whole, fraction = ""] = text.replaceAll(",", "").split(".");
  const amount = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (amount > maxMoney)
    throw new CheckoutError(
      400,
      "The checkout amount exceeds the supported limit.",
    );
  return amount;
}
export const money = (value: bigint) =>
  `₱${value / 100n}.${String(value % 100n).padStart(2, "0")}`;

function normalize(body: any, actor: CheckoutActor) {
  if (!uuid.test(String(body?.requestKey || "")))
    throw new CheckoutError(400, "A valid checkout request key is required.");
  if (body.businessType && body.businessType !== "Retail")
    throw new CheckoutError(
      400,
      "This endpoint records retail checkouts only.",
    );
  if (
    !Array.isArray(body.items) ||
    !body.items.length ||
    body.items.length > 200
  )
    throw new CheckoutError(
      400,
      "Choose between 1 and 200 products for checkout.",
    );
  const seen = new Set<string>();
  const items = body.items
    .map((item: any) => {
      const productId = String(item?.productId || "").toLowerCase();
      if (
        !uuid.test(productId) ||
        seen.has(productId) ||
        !Number.isSafeInteger(item.quantity) ||
        item.quantity < 1 ||
        item.quantity > 1000000
      )
        throw new CheckoutError(
          400,
          "Each checkout line needs a unique product ID and a positive whole quantity.",
        );
      seen.add(productId);
      return {
        productId,
        quantity: item.quantity,
        unitPrice: cents(item.unitPrice).toString(),
      };
    })
    .sort((a: { productId: string }, b: { productId: string }) =>
      a.productId.localeCompare(b.productId),
    );
  if (
    !["Cash", "GCash", "Card"].includes(body.payment) ||
    !["None", "Senior", "PWD"].includes(body.discountType)
  )
    throw new CheckoutError(
      400,
      "Choose a valid payment method and discount type.",
    );
  if (
    typeof body.dateTime !== "string" ||
    !body.dateTime.trim() ||
    body.dateTime.length > 100
  )
    throw new CheckoutError(400, "A checkout date is required.");
  return {
    version: 2,
    userId: actor.id,
    dateTime: body.dateTime,
    payment: body.payment,
    discountType: body.discountType,
    amountReceived: cents(body.amountReceived).toString(),
    quotedTotal: cents(body.total).toString(),
    items,
  };
}

export function createAtomicCheckout(transaction: Transaction, read: Query) {
  const confirmed = (sale: any) => ({ ...sale, stockCommitted: true });
  async function reconcile(key: string, actor: CheckoutActor) {
    if (!uuid.test(key))
      throw new CheckoutError(400, "Invalid checkout reference.");
    const native = (
      await readRetailSales(read, undefined, key.toLowerCase())
    )[0];
    if (native) {
      const [owner] = (
        await read("SELECT cashier_id FROM transactions WHERE id=$1", [key])
      ).rows;
      if (owner.cashier_id !== actor.id && actor.role !== "Admin")
        throw new CheckoutError(
          403,
          "You do not have permission to view this checkout.",
        );
      if (native.calculationVersion !== "retail-inclusive-v1")
        throw new CheckoutError(
          409,
          "This historical sale needs administrator review.",
        );
      return { state: "committed" as const, transaction: confirmed(native) };
    }
    const [legacy] = (
      await read(
        "SELECT * FROM cashier_transactions WHERE checkout_request_key=$1",
        [key.toLowerCase()],
      )
    ).rows;
    if (!legacy) return { state: "not_found" as const };
    const payload =
      typeof legacy.checkout_payload === "string"
        ? JSON.parse(legacy.checkout_payload)
        : legacy.checkout_payload;
    if (payload?.userId !== actor.id && actor.role !== "Admin")
      throw new CheckoutError(
        403,
        "You do not have permission to view this checkout.",
      );
    if (payload?.version !== 2)
      throw new CheckoutError(
        409,
        "This older payment needs administrator review.",
      );
    return {
      state: "committed" as const,
      transaction: confirmed(paymentFromRow(legacy)),
    };
  }
  async function save(body: any, actor: CheckoutActor) {
    const payload = normalize(body, actor),
      key = body.requestKey.toLowerCase();
    return transaction(async (query) => {
      await query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        key,
      ]);
      // Shared legacy lock also waits out old in-flight writes and serializes numbering.
      // Deployment must stop the old API writer before enabling this release.
      await query(
        "LOCK TABLE cashier_transactions IN SHARE ROW EXCLUSIVE MODE",
      );
      const [legacy] = (
        await query(
          "SELECT * FROM cashier_transactions WHERE checkout_request_key=$1",
          [key],
        )
      ).rows;
      if (legacy) {
        const prior =
          typeof legacy.checkout_payload === "string"
            ? JSON.parse(legacy.checkout_payload)
            : legacy.checkout_payload;
        const comparison = { ...payload, version: 2 };
        const [match] = (
          await query(
            `SELECT (CASE WHEN jsonb_typeof(checkout_payload)='string' THEN (checkout_payload #>> '{}')::jsonb ELSE checkout_payload END)=$2::text::jsonb AS matches FROM cashier_transactions WHERE id=$1`,
            [legacy.id, JSON.stringify(comparison)],
          )
        ).rows;
        if (!match.matches || prior?.version !== 2)
          throw new CheckoutError(
            409,
            "This checkout reference was already used with different details.",
            { code: "reference_conflict" },
          );
        return confirmed(paymentFromRow(legacy));
      }
      const [previous] = (
        await query(
          "SELECT checkout_payload,calculation_version FROM transactions WHERE id=$1",
          [key],
        )
      ).rows;
      if (previous) {
        const [match] = (
          await query(
            "SELECT checkout_payload=$2::text::jsonb AS matches FROM transactions WHERE id=$1",
            [key, JSON.stringify({ ...payload, version: 3 })],
          )
        ).rows;
        if (
          !match.matches ||
          previous.calculation_version !== "retail-inclusive-v1"
        )
          throw new CheckoutError(
            409,
            "This checkout reference was already used with different details.",
            { code: "reference_conflict" },
          );
        return confirmed((await readRetailSales(query, undefined, key))[0]);
      }
      if (body.contractVersion !== 3)
        throw new CheckoutError(
          409,
          "Refresh the app before recording a new sale. Existing pending payments must be checked using their original reference.",
          { code: "client_version" },
        );
      const [cashier] = (
        await query("SELECT full_name FROM users WHERE id=$1 FOR SHARE", [
          actor.id,
        ])
      ).rows;
      if (!cashier?.full_name?.trim())
        throw new CheckoutError(
          409,
          "Ask an administrator to complete your full name before recording a sale.",
        );
      const ids = payload.items.map(
        (line: { productId: string }) => line.productId,
      );
      const products = (
        await query(
          "SELECT * FROM products WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE",
          [ids],
        )
      ).rows;
      if (products.length !== ids.length)
        throw new CheckoutError(409, "A cart product is no longer available.");
      const batches = (
        await query(
          "SELECT b.*,b.expiration_date::text AS expiry_calendar FROM batch_info b WHERE product_id=ANY($1::uuid[]) ORDER BY b.product_id,b.expiration_date,b.id FOR UPDATE",
          [ids],
        )
      ).rows;
      const today = pharmacyDate();
      let gross = 0n,
        discount = 0n,
        vat = 0n,
        total = 0n;
      const allocations: {
        productId: string;
        batchId: string;
        quantity: number;
        price: bigint;
        name: string;
        exempt: boolean;
        gross: bigint;
        discount: bigint;
        vat: bigint;
        net: bigint;
      }[] = [];
      for (const line of payload.items) {
        const product = products.find((p) => p.id === line.productId)!,
          price = cents(product.selling_price);
        if (typeof product.is_vat_exempt !== "boolean")
          throw new CheckoutError(
            409,
            product.product_name +
              ": VAT classification is required. Edit the product before checkout.",
            { productId: product.id, code: "vat_unclassified" },
          );
        if (price.toString() !== line.unitPrice)
          throw new CheckoutError(
            409,
            product.product_name +
              ": The price changed. Remove and re-add this product.",
            { productId: product.id, code: "price_changed" },
          );
        const eligible = batches.filter(
          (b) =>
            b.product_id === product.id &&
            b.expiry_calendar >= today &&
            Number(b.quantity_remaining) > 0,
        );
        const available = eligible.reduce(
          (sum, b) => sum + Number(b.quantity_remaining),
          0,
        );
        if (available < line.quantity)
          throw new CheckoutError(
            409,
            product.product_name + ": Only " + available + " unit(s) remain.",
            { productId: product.id, available, code: "stock_conflict" },
          );
        let remaining = line.quantity;
        const chosen: { batchId: string; quantity: number }[] = [];
        for (const batch of eligible) {
          const quantity = Math.min(
            remaining,
            Number(batch.quantity_remaining),
          );
          if (quantity) chosen.push({ batchId: batch.id, quantity });
          remaining -= quantity;
          if (!remaining) break;
        }
        const amounts = calculateRetailLine(
          price,
          line.quantity,
          product.is_vat_exempt,
          payload.discountType !== "None",
        );
        gross += amounts.gross;
        discount += amounts.discount;
        vat += amounts.vat;
        total += amounts.net;
        if ([gross, discount, vat, total].some((n) => n > maxMoney))
          throw new CheckoutError(
            400,
            "The checkout amount exceeds the supported limit.",
          );
        const weights = chosen.map((b) => price * BigInt(b.quantity));
        const reliefs = allocateRetailAmount(amounts.relief, weights);
        const discounts = allocateRetailAmount(
          amounts.discount,
          weights.map((w, i) => w - reliefs[i]),
        );
        const taxes = allocateRetailAmount(amounts.vat, weights);
        chosen.forEach((batch, i) =>
          allocations.push({
            ...batch,
            productId: product.id,
            price,
            name: product.product_name,
            exempt: product.is_vat_exempt,
            gross: weights[i],
            discount: discounts[i],
            vat: taxes[i],
            net: weights[i] - reliefs[i] - discounts[i],
          }),
        );
      }
      if (total.toString() !== payload.quotedTotal)
        throw new CheckoutError(
          409,
          "The checkout total changed. Review the cart before paying.",
          { code: "total_changed" },
        );
      const received =
        payload.payment === "Cash" ? BigInt(payload.amountReceived) : total;
      if (received < total)
        throw new CheckoutError(
          400,
          "Cash tendered is less than the total amount due.",
        );
      const decimal = (n: bigint) =>
        n / 100n + "." + String(n % 100n).padStart(2, "0");
      // One numbering authority across both stores, still under the shared legacy lock.
      const [max] = (
        await query(
          "SELECT COALESCE(max(n),0)::text AS n FROM (SELECT substring(transaction_number FROM 5)::numeric AS n FROM cashier_transactions WHERE transaction_number ~ '^TRX-[0-9]+$' UNION ALL SELECT substring(receipt_number FROM 5)::numeric FROM receipts WHERE receipt_number ~ '^TRX-[0-9]+$') used",
        )
      ).rows;
      let number: bigint;
      const [sequence] = (
        await query(
          "SELECT to_regclass('cashier_receipt_number_seq') IS NOT NULL AS present",
        )
      ).rows;
      if (sequence.present) {
        const [counter] = (
          await query(
            "SELECT last_value,is_called FROM cashier_receipt_number_seq",
          )
        ).rows;
        if (
          BigInt(counter.last_value) < BigInt(max.n) ||
          (BigInt(counter.last_value) === BigInt(max.n) && !counter.is_called)
        )
          await query("SELECT setval('cashier_receipt_number_seq',$1,true)", [
            max.n,
          ]);
        number = BigInt(
          (
            await query(
              "SELECT nextval('cashier_receipt_number_seq')::text AS n",
            )
          ).rows[0].n,
        );
      } else number = BigInt(max.n) + 1n;
      const receiptNumber = "TRX-" + number.toString().padStart(4, "0");
      if (
        (
          await query(
            "SELECT 1 FROM receipts WHERE receipt_number=$1 UNION ALL SELECT 1 FROM cashier_transactions WHERE transaction_number=$1",
            [receiptNumber],
          )
        ).rows.length
      )
        throw new CheckoutError(
          409,
          "Receipt numbering needs administrator review.",
        );
      await query(
        `INSERT INTO transactions(id,cashier_id,gross_amount,total_discount,vat_amount,net_amount,amount_tendered,change_amount,payment_method,checkout_payload,cashier_name_at_sale,calculation_version)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::text::jsonb,$11,'retail-inclusive-v1')`,
        [
          key,
          actor.id,
          decimal(gross),
          decimal(discount),
          decimal(vat),
          decimal(total),
          decimal(received),
          decimal(received - total),
          payload.payment,
          JSON.stringify({ ...payload, version: 3 }),
          cashier.full_name.trim(),
        ],
      );
      for (const allocation of allocations) {
        await query(
          `INSERT INTO transaction_items(transaction_id,product_id,batch_id,quantity,unit_price_at_sale,subtotal,product_name_at_sale,is_vat_exempt_at_sale,vat_rate_at_sale,vat_amount,net_amount,discount_amount)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            key,
            allocation.productId,
            allocation.batchId,
            allocation.quantity,
            decimal(allocation.price),
            decimal(allocation.gross),
            allocation.name,
            allocation.exempt,
            allocation.exempt ? "0.00" : "12.00",
            decimal(allocation.vat),
            decimal(allocation.net),
            decimal(allocation.discount),
          ],
        );
        const changed = await query(
          "UPDATE batch_info SET quantity_remaining=quantity_remaining-$2,updated_at=now() WHERE id=$1 AND quantity_remaining >= $2 RETURNING id",
          [allocation.batchId, allocation.quantity],
        );
        if (!changed.rows.length)
          throw new CheckoutError(409, "Stock changed during checkout.");
        await query(
          "INSERT INTO stock_movements(product_id,batch_id,movement_type,quantity,reference_id,notes) VALUES($1,$2,'Sale',$3,$4,$5)",
          [
            allocation.productId,
            allocation.batchId,
            allocation.quantity,
            key,
            "Retail sale " + receiptNumber,
          ],
        );
      }
      if (payload.discountType !== "None")
        await query(
          "INSERT INTO discounts(transaction_id,discount_type,discount_rate,discount_amount) VALUES($1,$2,20,$3)",
          [key, payload.discountType, decimal(discount)],
        );
      await query(
        "INSERT INTO receipts(transaction_id,receipt_number,merchant_name_at_issue) VALUES($1,$2,$3)",
        [key, receiptNumber, "MEDPRIX"],
      );
      for (const productId of ids)
        await query(
          "UPDATE products SET current_stock=(SELECT COALESCE(sum(quantity_remaining),0) FROM batch_info WHERE product_id=$1),updated_at=now() WHERE id=$1",
          [productId],
        );
      await writeAuditEvent(query, {
        actor,
        action: "SALE_COMPLETED",
        activity: "Transaction completed",
        module: "Sales POS",
        description:
          "Completed retail receipt " +
          receiptNumber +
          " (" +
          money(total) +
          ")",
        deviceIp: actor.deviceIp,
      });
      return confirmed((await readRetailSales(query, undefined, key))[0]);
    });
  }
  return { save, reconcile };
}
