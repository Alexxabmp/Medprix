-- Approved Phase 5B additions. No existing prices, receipts or legacy rows are rewritten.
-- Nullable snapshots preserve unknown historical facts. Runtime writers require classification.
-- Transactional runner supplies finite timeouts and the migration advisory lock.
DO $retail$
DECLARE item record; target regclass; existing text; expected text;
BEGIN
  FOR item IN SELECT * FROM (VALUES
    ('products','is_vat_exempt','boolean'),
    ('transactions','checkout_payload','jsonb'),
    ('transactions','cashier_name_at_sale','character varying(255)'),
    ('transactions','calculation_version','character varying(32)'),
    ('transaction_items','product_name_at_sale','character varying(255)'),
    ('transaction_items','is_vat_exempt_at_sale','boolean'),
    ('transaction_items','vat_rate_at_sale','numeric(5,2)'),
    ('transaction_items','vat_amount','numeric(12,2)'),
    ('transaction_items','net_amount','numeric(12,2)'),
    ('transaction_items','discount_amount','numeric(12,2)'),
    ('receipts','merchant_name_at_issue','character varying(255)')
  ) AS fields(table_name,column_name,type_name) LOOP
    target := format('%I.%I',current_schema(),item.table_name)::regclass;
    IF EXISTS (SELECT 1 FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      WHERE a.attrelid=target AND a.attname=item.column_name AND NOT a.attisdropped
      AND (format_type(a.atttypid,a.atttypmod)<>item.type_name OR a.attnotnull OR d.oid IS NOT NULL)) THEN
      RAISE EXCEPTION 'Incompatible retail column %.%',item.table_name,item.column_name;
    END IF;
    EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS %I %s',target,item.column_name,item.type_name);
  END LOOP;
  FOR item IN SELECT * FROM (VALUES
    ('transactions','retail_transaction_snapshot_check',
      $$calculation_version IS NULL OR (calculation_version='retail-inclusive-v1' AND checkout_payload IS NOT NULL AND jsonb_typeof(checkout_payload)='object' AND cashier_id IS NOT NULL AND cashier_name_at_sale IS NOT NULL AND btrim(cashier_name_at_sale)<>'' AND gross_amount>=0 AND total_discount>=0 AND vat_amount>=0 AND net_amount>=0 AND net_amount+total_discount<=gross_amount AND vat_amount<=net_amount AND amount_tendered>=net_amount AND change_amount=amount_tendered-net_amount)$$),
    ('transaction_items','retail_item_snapshot_check',
      $$((product_name_at_sale IS NULL AND is_vat_exempt_at_sale IS NULL AND vat_rate_at_sale IS NULL AND vat_amount IS NULL AND net_amount IS NULL AND discount_amount IS NULL) OR (product_name_at_sale IS NOT NULL AND btrim(product_name_at_sale)<>'' AND is_vat_exempt_at_sale IS NOT NULL AND vat_rate_at_sale IS NOT NULL AND vat_amount IS NOT NULL AND net_amount IS NOT NULL AND discount_amount IS NOT NULL AND vat_amount>=0 AND net_amount>=0 AND discount_amount>=0 AND net_amount+discount_amount<=subtotal AND vat_amount<=net_amount AND ((is_vat_exempt_at_sale AND vat_rate_at_sale=0 AND vat_amount=0) OR (NOT is_vat_exempt_at_sale AND vat_rate_at_sale=12))))$$),
    ('receipts','retail_merchant_snapshot_check',
      $$merchant_name_at_issue IS NULL OR btrim(merchant_name_at_issue)<>''$$)
  ) AS rules(table_name,constraint_name,expression) LOOP
    target := format('%I.%I',current_schema(),item.table_name)::regclass;
    -- Ask PostgreSQL to parse the expected expression against identical column types.
    -- Comparing parsed definitions avoids silently accepting a same-name wrong CHECK.
    EXECUTE format('CREATE TEMP TABLE _retail_expected (LIKE %s) ON COMMIT DROP',target);
    EXECUTE format('ALTER TABLE pg_temp._retail_expected ADD CONSTRAINT expected CHECK (%s)',item.expression);
    SELECT pg_get_constraintdef(oid,true) INTO expected FROM pg_constraint
      WHERE conrelid='pg_temp._retail_expected'::regclass AND conname='expected';
    SELECT pg_get_constraintdef(oid,true) INTO existing FROM pg_constraint
      WHERE conrelid=target AND conname=item.constraint_name;
    IF existing IS NOT NULL AND (existing<>expected OR NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conrelid=target AND conname=item.constraint_name AND contype='c' AND convalidated)) THEN
      RAISE EXCEPTION 'Incompatible retail constraint %',item.constraint_name;
    END IF;
    IF existing IS NULL THEN EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I CHECK (%s)',target,item.constraint_name,item.expression); END IF;
    DROP TABLE pg_temp._retail_expected;
  END LOOP;
END;
$retail$;
