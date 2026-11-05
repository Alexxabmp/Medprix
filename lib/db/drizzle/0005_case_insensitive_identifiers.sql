-- Existing-field rules only: preserve stored spellings, names and document IDs.
-- No collision is renamed, merged or deleted. Operator review is required.
LOCK TABLE users, products, supplier_invoices IN SHARE ROW EXCLUSIVE MODE;
DO $identifiers$
DECLARE
  item record;
  target regclass;
  existing regclass;
  expected_expression text;
BEGIN
  FOR item IN SELECT * FROM (VALUES
    ('users','username','users_username_key','uq_users_username_ci','lower(btrim((username)::text))',1),
    ('products','sku','uq_products_sku','uq_products_sku_ci','upper(btrim((sku)::text))',1),
    ('supplier_invoices','invoice_number','supplier_invoices_invoice_number_key','uq_supplier_invoices_supplier_number_ci','upper(btrim((invoice_number)::text))',2)
  ) AS rules(table_name,column_name,old_constraint,index_name,expression,key_count) LOOP
    target := format('%I.%I',current_schema(),item.table_name)::regclass;
    IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid=target AND attname=item.column_name
      AND NOT attisdropped AND attnotnull AND format_type(atttypid,atttypmod)='character varying(100)') THEN
      RAISE EXCEPTION 'Incompatible identifier column %.%',item.table_name,item.column_name;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=target AND conname=item.old_constraint
      AND (contype<>'u' OR pg_get_constraintdef(oid,true)<>format('UNIQUE (%I)',item.column_name))) THEN
      RAISE EXCEPTION 'Incompatible old identifier constraint %',item.old_constraint;
    END IF;
    existing := to_regclass(format('%I.%I',current_schema(),item.index_name));
    IF existing IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_am am ON am.oid=c.relam
      WHERE i.indexrelid=existing AND i.indrelid=target AND i.indisunique AND i.indisvalid AND i.indisready
        AND NOT i.indisprimary AND NOT i.indisexclusion AND i.indpred IS NULL AND am.amname='btree'
        AND i.indnkeyatts=item.key_count AND i.indnatts=item.key_count
        AND pg_get_expr(i.indexprs,i.indrelid)=item.expression
        AND (item.key_count=1 OR i.indkey[0]=(SELECT attnum FROM pg_attribute WHERE attrelid=target AND attname='supplier_id'))
    ) THEN RAISE EXCEPTION 'Incompatible identifier index %',item.index_name; END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM users WHERE btrim(username)='') OR
    EXISTS (SELECT 1 FROM products WHERE btrim(sku)='') OR
    EXISTS (SELECT 1 FROM supplier_invoices WHERE btrim(invoice_number)='') THEN
    RAISE EXCEPTION 'Blank existing identifier; review existing data before migrating';
  END IF;
  IF EXISTS (SELECT lower(btrim(username)) FROM users GROUP BY lower(btrim(username)) HAVING count(*)>1) THEN
    RAISE EXCEPTION 'Case-insensitive username collisions; review existing data before migrating';
  END IF;
  IF EXISTS (SELECT upper(btrim(sku)) FROM products GROUP BY upper(btrim(sku)) HAVING count(*)>1) THEN
    RAISE EXCEPTION 'Case-insensitive product code collisions; review existing data before migrating';
  END IF;
  IF EXISTS (SELECT supplier_id,upper(btrim(invoice_number)) FROM supplier_invoices
    GROUP BY supplier_id,upper(btrim(invoice_number)) HAVING count(*)>1) THEN
    RAISE EXCEPTION 'Case-insensitive invoice collisions within a supplier; review existing data before migrating';
  END IF;
END;
$identifiers$;
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_username_ci ON users (lower(btrim(username)));
CREATE UNIQUE INDEX IF NOT EXISTS uq_products_sku_ci ON products (upper(btrim(sku)));
CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_invoices_supplier_number_ci ON supplier_invoices (supplier_id,upper(btrim(invoice_number)));
-- Replace narrower/redundant constraints only after the new indexes exist.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_key;
ALTER TABLE products DROP CONSTRAINT IF EXISTS uq_products_sku;
ALTER TABLE supplier_invoices DROP CONSTRAINT IF EXISTS supplier_invoices_invoice_number_key;
