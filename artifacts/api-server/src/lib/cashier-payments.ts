type Query = (sql: string, params?: any[]) => Promise<{ rows: any[] }>;

export class PaymentError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function paymentFromRow(row: any) {
  return {
    id: Number(row.id), transactionNumber: row.transaction_number, dateTime: row.date_time,
    user: row.user_name, businessType: row.business_type, customer: row.customer,
    total: row.total, subtotal: row.subtotal, discount: row.discount, vat: row.vat,
    amountReceived: row.amount_received, change: row.change, payment: row.payment,
    status: row.status, items: typeof row.items === "string" ? JSON.parse(row.items) : row.items,
  };
}

export function createPaymentStore(query: Query) {
  let preparation: Promise<void> | undefined;
  let numbering: Promise<void> | undefined;
  const prepare = () => preparation ??= query(`DO $$ BEGIN
    LOCK TABLE cashier_transactions IN SHARE ROW EXCLUSIVE MODE;
    ALTER TABLE cashier_transactions ADD COLUMN IF NOT EXISTS checkout_request_key TEXT;
    ALTER TABLE cashier_transactions ADD COLUMN IF NOT EXISTS checkout_payload JSONB;
    CREATE UNIQUE INDEX IF NOT EXISTS cashier_checkout_request_key_idx
      ON cashier_transactions(checkout_request_key);
    CREATE TABLE IF NOT EXISTS cashier_payment_migrations (name TEXT PRIMARY KEY);
    INSERT INTO cashier_payment_migrations(name) VALUES('checkout-idempotency-v1') ON CONFLICT DO NOTHING;
  END $$;`).then(() => {}).catch((error) => { preparation = undefined; throw error; });

  const prepareNumbering = async () => {
    await prepare();
    return numbering ??= query(`DO $$ DECLARE base BIGINT; BEGIN
      LOCK TABLE cashier_transactions IN SHARE ROW EXCLUSIVE MODE;
      IF NOT EXISTS(SELECT 1 FROM cashier_payment_migrations WHERE name='receipt-sequence-v1') THEN
        CREATE SEQUENCE IF NOT EXISTS cashier_receipt_number_seq AS BIGINT;
        SELECT GREATEST(
          (SELECT CASE WHEN is_called THEN last_value ELSE 0 END FROM cashier_receipt_number_seq),
          COALESCE((SELECT max(suffix)::bigint FROM (
            SELECT substring(transaction_number FROM 5)::numeric AS suffix
            FROM cashier_transactions WHERE transaction_number ~ '^TRX-[0-9]+$'
          ) numbers WHERE suffix <= 9223372036854775807), 0)
        ) INTO base;
        PERFORM setval('cashier_receipt_number_seq', GREATEST(base,1), base > 0);
        INSERT INTO cashier_payment_migrations(name) VALUES('receipt-sequence-v1');
      END IF;
    END $$;`).then(() => {}).catch((error) => { numbering = undefined; throw error; });
  };

  async function importLegacy(records: any[]) {
    await prepare();
    // One atomic import for an empty legacy installation. Never merge file snapshots
    // back into an established database or repopulate an intentionally emptied table.
    await query(`WITH claim AS (
      INSERT INTO cashier_payment_migrations(name) VALUES ('legacy-file-import-v1')
      ON CONFLICT DO NOTHING RETURNING name
    ), imported AS (
      INSERT INTO cashier_transactions(transaction_number,date_time,user_name,business_type,
        customer,total,subtotal,discount,vat,amount_received,change,payment,status,items)
      SELECT value->>'transactionNumber', value->>'dateTime', value->>'user',
        COALESCE(value->>'businessType','Retail'), COALESCE(value->>'customer','Walk-in Customer'),
        value->>'total', value->>'subtotal', COALESCE(value->>'discount','0.00'),
        COALESCE(value->>'vat','0.00'), COALESCE(value->>'amountReceived','0.00'),
        COALESCE(value->>'change','0.00'), COALESCE(value->>'payment','Cash'),
        COALESCE(value->>'status','Completed'), COALESCE(value->'items','[]'::jsonb)
      FROM jsonb_array_elements($1::jsonb)
      WHERE EXISTS(SELECT 1 FROM claim) AND NOT EXISTS(SELECT 1 FROM cashier_transactions)
      ON CONFLICT(transaction_number) DO NOTHING RETURNING id
    ) SELECT count(*) FROM imported`, [JSON.stringify(records)]);
  }

  async function list() {
    await prepare();
    return (await query("SELECT * FROM cashier_transactions ORDER BY id DESC")).rows.map(paymentFromRow);
  }

  async function save(body: any) {
    await prepareNumbering();
    const key = body.requestKey;
    if (typeof key !== "string" || !/^[a-zA-Z0-9-]{16,100}$/.test(key)) {
      throw new PaymentError(400, "A valid checkout request key is required.");
    }
    if (!Array.isArray(body.items) || !body.items.length || !body.dateTime || !body.user || !body.total || !body.subtotal) {
      throw new PaymentError(400, "The sale is missing required payment details.");
    }
    const payload = {
      dateTime: body.dateTime, user: body.user,
      businessType: body.businessType === "Wholesale" ? "Wholesale" : "Retail",
      customer: body.customer || "Walk-in Customer", total: body.total, subtotal: body.subtotal,
      discount: body.discount || "0.00", vat: body.vat || "0.00",
      amountReceived: body.amountReceived || "0.00", change: body.change || "0.00",
      payment: body.payment || "Cash", status: "Completed", items: body.items,
    };
    const result = await query(`WITH allocated AS (SELECT nextval('cashier_receipt_number_seq') AS number)
      INSERT INTO cashier_transactions(
      transaction_number,date_time,user_name,business_type,customer,total,subtotal,discount,vat,
      amount_received,change,payment,status,items,checkout_request_key,checkout_payload)
      SELECT 'TRX-' || lpad(number::text,GREATEST(4,length(number::text)),'0'),
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15::jsonb FROM allocated
      ON CONFLICT(checkout_request_key) DO UPDATE SET checkout_request_key=EXCLUDED.checkout_request_key
      WHERE cashier_transactions.checkout_payload=EXCLUDED.checkout_payload RETURNING *`,
    [payload.dateTime, payload.user, payload.businessType, payload.customer,
      payload.total,payload.subtotal,payload.discount,payload.vat,payload.amountReceived,payload.change,
      payload.payment,payload.status,JSON.stringify(payload.items),key,JSON.stringify(payload)]);
    if (!result.rows.length) throw new PaymentError(409, "This checkout request was already used with different sale details.");
    return paymentFromRow(result.rows[0]);
  }
  return { prepare, prepareNumbering, importLegacy, list, save };
}
