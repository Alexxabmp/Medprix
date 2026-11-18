import { assertWholesaleInstallmentsReady } from "./wholesale-installment-contract";
import { assertWholesaleCollectionsReady } from "./wholesale-collections-contract";
import { assertWholesaleFulfillmentReady } from "./wholesale-fulfillment-contract";
import { assertWholesaleReservationsReady } from "./wholesale-reservation-contract";
import { assertWholesaleDraftReady } from "./wholesale-draft-contract";
import { retailSnapshotChecks } from "./retail-snapshot-contract";
import { initialContract, cashierContract, timestampTriggers } from "./schema-contract";
export type CatalogQuery = (text: string, params?: any[]) => Promise<{ rows: any[] }>;

/** Catalog queries only. Never import the application initializer here. */
export async function inspectSchema(query: CatalogQuery, namespace = "public") {
  const [tables, columns, constraints, indexes, enums, triggers, functions] = await Promise.all([
    query("SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relkind='r'", [namespace]),
    query(`SELECT c.relname AS table_name,a.attname AS name,format_type(a.atttypid,a.atttypmod) AS type,
      a.attnotnull AS not_null,pg_get_expr(d.adbin,d.adrelid) AS default_value
      FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      WHERE n.nspname=$1 AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped`, [namespace]),
    query(`SELECT c.relname AS table_name,k.conname AS name,k.contype AS type,
      pg_get_constraintdef(k.oid,true) AS definition,k.convalidated AS validated
      FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname=$1 AND k.contype<>'n'`, [namespace]),
    query(`SELECT t.relname AS table_name,c.relname AS name,pg_get_indexdef(c.oid) AS definition,
      i.indisvalid AS valid,i.indisready AS ready
      FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_class t ON t.oid=i.indrelid
      JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname=$1`, [namespace]),
    query(`SELECT t.typname AS name,array_agg(e.enumlabel ORDER BY e.enumsortorder) AS labels
      FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace JOIN pg_enum e ON e.enumtypid=t.oid
      WHERE n.nspname=$1 GROUP BY t.typname`, [namespace]),
    query(`SELECT c.relname AS table_name,t.tgname AS name,pg_get_triggerdef(t.oid,true) AS definition,t.tgenabled AS enabled
      FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname=$1 AND NOT t.tgisinternal`, [namespace]),
    query(`SELECT p.proname AS name,p.prosrc AS body,p.prosecdef AS security_definer,l.lanname AS language,
      p.prorettype='trigger'::regtype AS returns_trigger FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      JOIN pg_language l ON l.oid=p.prolang WHERE n.nspname=$1 AND p.proname='update_updated_at_column' AND p.pronargs=0`, [namespace]),
  ]);
  return { tables: tables.rows, columns: columns.rows, constraints: constraints.rows, indexes: indexes.rows, enums: enums.rows, triggers: triggers.rows, functions: functions.rows };
}
export class SchemaReadinessError extends Error {
  constructor(public issues: string[]) {
    super(`Database schema is not ready: ${issues.slice(0, 10).join("; ")}${issues.length > 10 ? `; and ${issues.length - 10} more` : ""}. Run explicit migration status/plan; startup made no schema changes.`);
    this.name = "SchemaReadinessError";
  }
}
export async function assertSchemaReady(query: CatalogQuery, scope: "initial" | "cashier" | "legacy-runtime" | "audit-runtime" | "identifier-runtime" | "pre-retail-runtime" | "pre-retirement-runtime" | "pre-delivery-runtime" | "pre-wholesale-runtime" | "wholesale-draft-runtime" | "wholesale-reservation-runtime" | "wholesale-fulfillment-runtime" | "wholesale-collections-runtime" | "pre-category-runtime" | "pre-payment-reference-runtime" | "pre-discount-holder-runtime" | "pre-returning-customer-runtime" | "pre-prescription-runtime" | "pre-payment-plan-runtime" | "runtime" = "runtime", namespace = "public", existingTablesOnly = false) {
  const sharedPaymentPlan = scope === "runtime";
  const prescriptions = sharedPaymentPlan || scope === "pre-payment-plan-runtime";
  const returningCustomers = prescriptions || scope === "pre-prescription-runtime";
  const discountHolders = returningCustomers || scope === "pre-returning-customer-runtime";
  const paymentReferences = discountHolders || scope === "pre-discount-holder-runtime";
  const categoryPricing = paymentReferences || scope === "pre-payment-reference-runtime";
  const installments = categoryPricing || scope === "pre-category-runtime";
  const collections = installments || scope === "wholesale-collections-runtime";
  const fulfillment = collections || scope === "wholesale-fulfillment-runtime";
  const reservations = fulfillment || scope === "wholesale-reservation-runtime";
  const wholesale = reservations || scope === "wholesale-draft-runtime";
  const calendar = wholesale || scope === "pre-wholesale-runtime";
  const retiredSales = calendar || scope === "pre-delivery-runtime";
  const retail = retiredSales || scope === "pre-retirement-runtime";
  if (["pre-retail-runtime", "pre-retirement-runtime", "pre-delivery-runtime", "pre-wholesale-runtime", "wholesale-draft-runtime", "wholesale-reservation-runtime", "wholesale-fulfillment-runtime", "wholesale-collections-runtime", "pre-category-runtime", "pre-payment-reference-runtime", "pre-discount-holder-runtime", "pre-returning-customer-runtime", "pre-prescription-runtime", "pre-payment-plan-runtime"].includes(scope)) scope = "runtime";
  const actual = await inspectSchema(query, namespace);
  const issues: string[] = [];
  const normalize = (v: unknown) => typeof v === "string" ? v.replaceAll(`"${namespace}".`, "public.").replaceAll(`${namespace}.`, "public.") : v;
  for (const contract of scope === "initial" ? [initialContract] : [initialContract, cashierContract]) {
    const retired = (table: string) => (retiredSales && ['cashier_transactions','cashier_payment_migrations'].includes(table)) || (['audit-runtime','identifier-runtime','runtime'].includes(scope) && ['cashier_system_logs','cashier_user_activities'].includes(table)) || (scope === 'runtime' && ['roles','permissions','user_roles','role_permissions'].includes(table));
    const replaced = (name: string) => ['identifier-runtime','runtime'].includes(scope) && ['users_username_key','uq_products_sku','supplier_invoices_invoice_number_key'].includes(name);
    const absent = (table: string) => existingTablesOnly && !actual.tables.some(t => t.name === table);
    for (const name of contract.tables) if (!existingTablesOnly && !retired(name) && !actual.tables.some(t => t.name === name)) issues.push(`missing table ${name}`);
    for (const expected of contract.columns) {
      if (retired(expected.table_name) || absent(expected.table_name)) continue;
      const found = actual.columns.find(c => c.table_name === expected.table_name && c.name === expected.name);
      if (!found) { issues.push(`missing column ${expected.table_name}.${expected.name}`); continue; }
      for (const field of ["type", "not_null", "default_value"] as const)
        if (normalize(found[field]) !== normalize(calendar && expected.table_name === 'supplier_deliveries' && expected.name === 'delivery_date'
          ? field === 'type' ? 'date' : field === 'default_value' ? null : expected[field]
          : sharedPaymentPlan && expected.table_name === 'suppliers' && expected.name === 'payment_terms' ? field === 'type' ? 'payment_plan_enum' : field === 'not_null' ? true : expected[field] : expected[field])) issues.push(`incompatible ${expected.table_name}.${expected.name} ${field}`);
    }
    for (const expected of contract.constraints) {
      if (retired(expected.table_name) || absent(expected.table_name) || replaced(expected.name)) continue;
      const found = actual.constraints.find(c => c.table_name === expected.table_name && c.name === expected.name);
      if (!found || found.type !== expected.type || normalize(found.definition) !== normalize(expected.definition) || !found.validated)
        issues.push(`missing/incompatible constraint ${expected.name}`);
    }
    for (const expected of contract.indexes) {
      if (retired(expected.table_name) || absent(expected.table_name) || replaced(expected.name)) continue;
      const found = actual.indexes.find(i => i.table_name === expected.table_name && i.name === expected.name);
      if (!found || !found.valid || !found.ready || normalize(found.definition) !== normalize(expected.definition)) issues.push(`missing/incompatible index ${expected.name}`);
    }
    for (const expected of contract.enums) {
      const found = actual.enums.find(e => e.name === expected.name);
      if (existingTablesOnly && !found) continue;
      if (!found || JSON.stringify(found.labels) !== JSON.stringify(expected.labels)) issues.push(`missing/incompatible enum ${expected.name}`);
    }
  }
  if (['runtime','identifier-runtime','audit-runtime','legacy-runtime'].includes(scope)) for (const expected of timestampTriggers) {
    const found = actual.triggers.find(t => t.table_name === expected.table_name && t.name === expected.name);
    if (!found || found.enabled !== 'O' || normalize(found.definition) !== normalize(expected.definition))
      issues.push(`missing/incompatible timestamp trigger ${expected.name}`);
  }
  if (['runtime','identifier-runtime','audit-runtime','legacy-runtime'].includes(scope)) {
    const fn = actual.functions[0];
    if (!fn || fn.security_definer || fn.language !== 'plpgsql' || !fn.returns_trigger ||
      fn.body.toLowerCase().replaceAll(/\s/g, '') !== 'beginnew.updated_at=current_timestamp;returnnew;end;')
      issues.push('missing/incompatible timestamp function update_updated_at_column');
  }
  if (['identifier-runtime','runtime'].includes(scope)) for (const [name,table,expression] of [
    ['uq_users_username_ci','users','lower(btrim((username)::text))'],
    ['uq_products_sku_ci','products','upper(btrim((sku)::text))'],
    ['uq_supplier_invoices_supplier_number_ci','supplier_invoices','supplier_id, upper(btrim((invoice_number)::text))'],
  ]) {
    if (existingTablesOnly && !actual.tables.some(t => t.name === table)) continue;
    const found = actual.indexes.find(i => i.table_name === table && i.name === name);
    const expected = `CREATE UNIQUE INDEX ${name} ON public.${table} USING btree (${expression})`;
    if (!found || !found.valid || !found.ready || normalize(found.definition) !== expected)
      issues.push(`missing/incompatible identifier index ${name}`);
  }
  if (['identifier-runtime','runtime'].includes(scope)) for (const name of ['users_username_key','uq_products_sku','supplier_invoices_invoice_number_key'])
    if (actual.constraints.some(c => c.name === name)) issues.push(`obsolete identifier constraint ${name} remains`);
  if (['runtime','identifier-runtime','audit-runtime'].includes(scope)) for (const name of ['cashier_system_logs','cashier_user_activities'])
    if (actual.tables.some(t => t.name === name)) issues.push(`legacy audit table ${name} has not been retired`);
  if (scope === 'runtime') for (const name of ['roles','permissions','user_roles','role_permissions'])
    if (actual.tables.some(t => t.name === name)) issues.push(`legacy authorization table ${name} has not been retired`);
  if (retail) {
    for (const [table,name,type] of [
      ['products','is_vat_exempt','boolean'],['transactions','checkout_payload','jsonb'],
      ['transactions','cashier_name_at_sale','character varying(255)'],['transactions','calculation_version','character varying(32)'],
      ['transaction_items','product_name_at_sale','character varying(255)'],['transaction_items','is_vat_exempt_at_sale','boolean'],
      ['transaction_items','vat_rate_at_sale','numeric(5,2)'],['transaction_items','vat_amount','numeric(12,2)'],
      ['transaction_items','net_amount','numeric(12,2)'],['transaction_items','discount_amount','numeric(12,2)'],
      ['receipts','merchant_name_at_issue','character varying(255)'],
    ]) {
      if (existingTablesOnly && !actual.tables.some(t=>t.name===table)) continue;
      const found=actual.columns.find(c=>c.table_name===table&&c.name===name);
      if (!found || found.type!==type || found.not_null || found.default_value!==null) issues.push('missing/incompatible retail column '+table+'.'+name);
    }
    for (const expected of retailSnapshotChecks) {
      const found=actual.constraints.find(c=>c.name===expected.name&&c.table_name===expected.table_name);
      if (!found || found.type!=='c' || !found.validated || found.definition!==expected.definition) issues.push('missing/incompatible retail constraint '+expected.name);
    }
  }
  if (retiredSales) {
    for (const name of ['cashier_transactions','cashier_payment_migrations'])
      if (actual.tables.some(t=>t.name===name)) issues.push('retired legacy table remains: '+name);
    const sequences = (await query(`SELECT c.relname,s.*,(EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype IN ('a','i','e')) OR EXISTS (SELECT 1 FROM pg_depend d WHERE d.refclassid='pg_class'::regclass AND d.refobjid=c.oid)) AS owned
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_sequence s ON s.seqrelid=c.oid
      WHERE n.nspname=$1 AND c.relname IN ('retail_receipt_number_seq','cashier_receipt_number_seq')`,[namespace])).rows;
    const seq=sequences.find(s=>s.relname==='retail_receipt_number_seq');
    if (sequences.some(s=>s.relname==='cashier_receipt_number_seq') || !seq || Number(seq.seqtypid)!==20 || String(seq.seqincrement)!=='1'
      || String(seq.seqmin)!=='1' || String(seq.seqmax)!=='9223372036854775807' || seq.seqcycle || Number(seq.seqcache)<1 || seq.owned)
      issues.push('missing/incompatible canonical receipt sequence');
  }
  if (wholesale) await assertWholesaleDraftReady(query, actual, namespace, existingTablesOnly, issues);
  if (reservations) await assertWholesaleReservationsReady(query, actual, namespace, existingTablesOnly, issues);
  if (fulfillment) await assertWholesaleFulfillmentReady(query, actual, namespace, existingTablesOnly, issues);
  if (collections) await assertWholesaleCollectionsReady(query, actual, namespace, existingTablesOnly, issues);
  if (installments) await assertWholesaleInstallmentsReady(query, actual, namespace, existingTablesOnly, issues, sharedPaymentPlan ? "payment_plan_enum" : "wholesale_payment_plan_enum");
  if (categoryPricing && !existingTablesOnly) {
    for (const [table, name, type] of [["product_categories", "id", "uuid"], ["product_categories", "name", "character varying(100)"], ["product_categories", "is_vat", "boolean"], ["products", "initial_price", "numeric(12,2)"]]) {
      if (!actual.columns.some(column => column.table_name === table && column.name === name && column.type === type)) issues.push("missing/incompatible category pricing column " + table + "." + name);
    }
    for (const name of ["derive_product_category_price", "refresh_category_prices"]) {
      if (!actual.triggers.some(trigger => trigger.name === name && trigger.enabled === "O")) issues.push("missing category pricing trigger " + name);
    }
  }
  if (paymentReferences && !existingTablesOnly) {
    // Migration 0016: proof of non-cash payment.
    if (!actual.columns.some(column => column.table_name === "transactions" && column.name === "payment_reference" && column.type === "character varying(32)" && !column.not_null))
      issues.push("missing/incompatible payment reference column transactions.payment_reference");
    const check = actual.constraints.find(constraint => constraint.table_name === "transactions" && constraint.name === "transactions_payment_reference_check");
    if (!check || check.type !== "c" || !check.validated || normalize(check.definition) !== "CHECK (payment_reference IS NULL OR payment_method::text = 'GCash'::text AND payment_reference::text ~ '^[0-9]{10,13}$'::text OR payment_method::text = 'Card'::text AND payment_reference::text ~ '^[A-Z0-9]{6}$'::text)")
      issues.push("missing/incompatible payment reference constraint transactions_payment_reference_check");
    const unique = actual.indexes.find(index => index.table_name === "transactions" && index.name === "uq_transactions_payment_reference");
    if (!unique || !unique.valid || !unique.ready || normalize(unique.definition) !== "CREATE UNIQUE INDEX uq_transactions_payment_reference ON public.transactions USING btree (payment_method, payment_reference) WHERE (payment_reference IS NOT NULL)")
      issues.push("missing/incompatible payment reference index uq_transactions_payment_reference");
  }
  if (discountHolders && !existingTablesOnly) {
    // Migration 0017: Senior citizen / PWD name and ID number on discounted sales.
    for (const [name, type] of [["holder_name", "character varying(120)"], ["holder_id_number", "character varying(40)"]])
      if (!actual.columns.some(column => column.table_name === "discounts" && column.name === name && column.type === type && !column.not_null))
        issues.push("missing/incompatible discount holder column discounts." + name);
    const check = actual.constraints.find(constraint => constraint.table_name === "discounts" && constraint.name === "discounts_holder_check");
    if (!check || check.type !== "c" || !check.validated || normalize(check.definition) !== "CHECK (holder_name IS NULL AND holder_id_number IS NULL OR btrim(holder_name::text) <> ''::text AND btrim(holder_id_number::text) <> ''::text)")
      issues.push("missing/incompatible discount holder constraint discounts_holder_check");
  }
  if (returningCustomers && !existingTablesOnly) {
    // Migration 0018: consent record and usual-order items for returning customers.
    const hasColumn = (table: string, name: string, type: string, notNull: boolean) =>
      actual.columns.some(column => column.table_name === table && column.name === name && column.type === type && column.not_null === notNull);
    for (const [table, name, type, notNull] of [
      ["customers", "consent_at", "timestamp with time zone", false], ["customers", "consent_recorded_by", "uuid", false],
      ["customer_usual_items", "id", "uuid", true], ["customer_usual_items", "customer_id", "uuid", true],
      ["customer_usual_items", "product_id", "uuid", true], ["customer_usual_items", "quantity", "integer", true],
      ["customer_usual_items", "created_at", "timestamp with time zone", true],
    ] as const)
      if (!hasColumn(table, name, type, notNull)) issues.push(`missing/incompatible returning customer column ${table}.${name}`);
    for (const [table, name, definition] of [
      ["customers", "customers_consent_recorded_by_fkey", "FOREIGN KEY (consent_recorded_by) REFERENCES users(id) ON DELETE SET NULL"],
      ["customer_usual_items", "customer_usual_items_customer_fkey", "FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE"],
      ["customer_usual_items", "customer_usual_items_product_fkey", "FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE"],
      ["customer_usual_items", "customer_usual_items_quantity_check", "CHECK (quantity >= 1 AND quantity <= 100000)"],
      ["customer_usual_items", "uq_customer_usual_items", "UNIQUE (customer_id, product_id)"],
    ] as const) {
      const found = actual.constraints.find(constraint => constraint.table_name === table && constraint.name === name);
      if (!found || !found.validated || normalize(found.definition) !== definition) issues.push(`missing/incompatible returning customer constraint ${name}`);
    }
  }
  if (prescriptions && !existingTablesOnly) {
    // Migration 0019: prescription-required flag; controlled drugs always need it.
    if (!actual.columns.some(column => column.table_name === "products" && column.name === "requires_prescription" && column.type === "boolean" && column.not_null && normalize(column.default_value ?? "") === "false"))
      issues.push("missing/incompatible prescription column products.requires_prescription");
    const rxCheck = actual.constraints.find(constraint => constraint.table_name === "products" && constraint.name === "products_dangerous_requires_prescription_check");
    if (!rxCheck || !rxCheck.validated || normalize(rxCheck.definition) !== "CHECK (NOT is_dangerous_drug OR requires_prescription)")
      issues.push("missing/incompatible prescription constraint products_dangerous_requires_prescription_check");
  }
  if (issues.length) throw new SchemaReadinessError(issues);
  return actual;
}
