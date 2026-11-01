import { PaymentError, paymentFromRow } from "./cashier-payments";

export type Query = (text: string, params?: any[]) => Promise<{ rows: any[] }>;
export type Transaction = <T>(work: (query: Query) => Promise<T>) => Promise<T>;
export type CheckoutActor = { id: string; username: string; role: string };
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
const percent = (value: bigint, rate: bigint) => (value * rate + 50n) / 100n;

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
  const confirmed = (row: any) => ({
    ...paymentFromRow(row),
    stockCommitted: true,
  });
  async function reconcile(key: string, actor: CheckoutActor) {
    if (!uuid.test(key))
      throw new CheckoutError(400, "Invalid checkout reference.");
    const [row] = (
      await read(
        "SELECT * FROM cashier_transactions WHERE checkout_request_key=$1",
        [key.toLowerCase()],
      )
    ).rows;
    if (!row) return { state: "not_found" as const };
    const payload =
      typeof row.checkout_payload === "string"
        ? JSON.parse(row.checkout_payload)
        : row.checkout_payload;
    if (payload?.version !== 2)
      throw new CheckoutError(
        409,
        "This older payment needs administrator review before another sale is recorded.",
      );
    if (payload.userId !== actor.id && actor.role !== "Admin")
      throw new CheckoutError(
        403,
        "You do not have permission to view this checkout.",
      );
    return { state: "committed" as const, transaction: confirmed(row) };
  }
  async function save(body: any, actor: CheckoutActor) {
    const payload = normalize(body, actor);
    const key = body.requestKey.toLowerCase();
    return transaction(async (query) => {
      // Existing storage only. Missing legacy prerequisites never trigger DDL here.
      const columns = (
        await query(
          "SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='cashier_transactions'",
        )
      ).rows;
      if (
        !["checkout_request_key", "checkout_payload"].every((name) =>
          columns.some((column) => column.column_name === name),
        )
      )
        throw new CheckoutError(
          503,
          "Checkout storage is not ready. Ask an administrator to review its setup; no schema changes were made.",
        );
      // This lock also makes replay checks safe before allocating stock or a number.
      await query(
        "LOCK TABLE cashier_transactions IN SHARE ROW EXCLUSIVE MODE",
      );
      const [previous] = (
        await query(
          "SELECT * FROM cashier_transactions WHERE checkout_request_key=$1",
          [key],
        )
      ).rows;
      if (previous) {
        const previousPayload =
          typeof previous.checkout_payload === "string"
            ? JSON.parse(previous.checkout_payload)
            : previous.checkout_payload;
        // jsonb equality ignores object key ordering while preserving all request details.
        const [match] = (
          await query(
            "SELECT checkout_payload=$2::jsonb AS matches FROM cashier_transactions WHERE id=$1",
            [previous.id, JSON.stringify(payload)],
          )
        ).rows;
        if (!match.matches || previousPayload?.version !== 2)
          throw new CheckoutError(
            409,
            "This checkout reference was already used with different details.",
          );
        return confirmed(previous);
      }
      const ids = payload.items.map(
        (item: { productId: string }) => item.productId,
      );
      const products = (
        await query(
          "SELECT * FROM products WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE",
          [ids],
        )
      ).rows;
      if (products.length !== ids.length)
        throw new CheckoutError(
          409,
          "A cart product is no longer available. Remove it and refresh inventory.",
        );
      const batches = (
        await query(
          "SELECT * FROM batch_info WHERE product_id=ANY($1::uuid[]) ORDER BY product_id,expiration_date,id FOR UPDATE",
          [ids],
        )
      ).rows;
      let subtotal = 0n;
      const saleItems: any[] = [];
      const allocations: {
        productId: string;
        batchId: string;
        quantity: number;
      }[] = [];
      for (const line of payload.items) {
        const product = products.find((item) => item.id === line.productId)!;
        const price = cents(product.selling_price);
        if (price.toString() !== line.unitPrice)
          throw new CheckoutError(
            409,
            `${product.product_name}: The price changed. Remove and re-add this item to review the current price.`,
            { productId: product.id, code: "price_changed" },
          );
        const productBatches = batches.filter(
          (batch) => batch.product_id === product.id,
        );
        const available = productBatches.reduce(
          (sum, batch) => sum + Number(batch.quantity_remaining),
          0,
        );
        if (available < line.quantity)
          throw new CheckoutError(
            409,
            `${product.product_name}: Only ${available} unit(s) remain. Edit or remove this item.`,
            { productId: product.id, available, code: "stock_conflict" },
          );
        let remaining = line.quantity;
        for (const batch of productBatches) {
          const quantity = Math.min(
            remaining,
            Number(batch.quantity_remaining),
          );
          if (quantity > 0)
            allocations.push({
              productId: product.id,
              batchId: batch.id,
              quantity,
            });
          remaining -= quantity;
          if (!remaining) break;
        }
        const lineTotal = price * BigInt(line.quantity);
        subtotal += lineTotal;
        saleItems.push({
          productId: product.id,
          product: product.product_name,
          quantity: line.quantity,
          unitPrice: money(price),
          subtotal: money(lineTotal),
        });
      }
      const discount =
        payload.discountType === "None" ? 0n : percent(subtotal, 20n);
      const vat = payload.discountType === "None" ? percent(subtotal, 12n) : 0n;
      const total = subtotal - discount + vat;
      if (total > maxMoney || total.toString() !== payload.quotedTotal)
        throw new CheckoutError(
          409,
          "The checkout total changed. Review the cart and discount before paying.",
          { code: "total_changed" },
        );
      const received =
        payload.payment === "Cash" ? BigInt(payload.amountReceived) : total;
      if (received < total)
        throw new CheckoutError(
          400,
          "Cash tendered is less than the total amount due.",
        );
      let number: string;
      const [sequence] = (
        await query(
          "SELECT to_regclass('cashier_receipt_number_seq') IS NOT NULL AS present",
        )
      ).rows;
      if (sequence.present)
        number = String(
          (
            await query(
              "SELECT nextval('cashier_receipt_number_seq')::text AS number",
            )
          ).rows[0].number,
        );
      else {
        // Fresh legacy installations can allocate under the table lock, without creating a sequence.
        number = String(
          (
            await query(
              "SELECT (COALESCE(max(substring(transaction_number FROM 5)::numeric),0)+1)::text AS number FROM cashier_transactions WHERE transaction_number ~ '^TRX-[0-9]+$'",
            )
          ).rows[0].number,
        );
      }
      const transactionNumber = `TRX-${number.padStart(4, "0")}`;
      const [sale] = (
        await query(
          `INSERT INTO cashier_transactions(transaction_number,date_time,user_name,business_type,customer,total,subtotal,discount,vat,amount_received,change,payment,status,items,checkout_request_key,checkout_payload)
        VALUES($1,$2,$3,'Retail','Walk-in Customer',$4,$5,$6,$7,$8,$9,$10,'Completed',$11::jsonb,$12,$13::jsonb) RETURNING *`,
          [
            transactionNumber,
            payload.dateTime,
            actor.username,
            money(total),
            money(subtotal),
            money(discount),
            money(vat),
            money(received),
            money(received - total),
            payload.payment,
            JSON.stringify(saleItems),
            key,
            JSON.stringify(payload),
          ],
        )
      ).rows;
      for (const allocation of allocations) {
        const changed = await query(
          "UPDATE batch_info SET quantity_remaining=quantity_remaining-$2,updated_at=now() WHERE id=$1 AND quantity_remaining >= $2 RETURNING id",
          [allocation.batchId, allocation.quantity],
        );
        if (!changed.rows.length)
          throw new CheckoutError(
            409,
            "Stock changed during checkout. Refresh inventory and review the cart.",
          );
        await query(
          "INSERT INTO stock_movements(product_id,batch_id,movement_type,quantity,notes) VALUES($1,$2,'Sale',$3,$4)",
          [
            allocation.productId,
            allocation.batchId,
            allocation.quantity,
            `Retail sale ${transactionNumber}; checkout ${key}`,
          ],
        );
      }
      for (const productId of ids)
        await query(
          "UPDATE products SET current_stock=(SELECT COALESCE(sum(quantity_remaining),0) FROM batch_info WHERE product_id=$1),updated_at=now() WHERE id=$1",
          [productId],
        );
      return confirmed(sale);
    });
  }
  return { save, reconcile };
}
