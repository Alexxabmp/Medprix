-- Approved final local cleanup: no legacy sales are discarded.
-- Existing runner supplies transaction, migration advisory lock and finite timeouts.
DO $retire$
DECLARE app_schema text := current_schema(); target regclass; name text; has_rows boolean;
  old_sequence regclass; new_sequence regclass; seq record;
BEGIN
  old_sequence := to_regclass(format('%I.cashier_receipt_number_seq',app_schema));
  new_sequence := to_regclass(format('%I.retail_receipt_number_seq',app_schema));
  IF old_sequence IS NOT NULL AND new_sequence IS NOT NULL THEN RAISE EXCEPTION 'Both receipt sequences exist; no automatic counter merge'; END IF;
  target := COALESCE(old_sequence,new_sequence);
  IF target IS NOT NULL THEN
    SELECT * INTO seq FROM pg_sequence WHERE seqrelid=target;
    IF NOT FOUND OR seq.seqtypid<>'bigint'::regtype OR seq.seqincrement<>1 OR seq.seqmin<>1
      OR seq.seqmax<>9223372036854775807 OR seq.seqcycle OR seq.seqcache<1
      OR EXISTS (SELECT 1 FROM pg_depend WHERE classid='pg_class'::regclass AND objid=target AND deptype IN ('a','i','e'))
      OR EXISTS (SELECT 1 FROM pg_depend WHERE refclassid='pg_class'::regclass AND refobjid=target)
    THEN RAISE EXCEPTION 'Incompatible receipt sequence type/settings/ownership'; END IF;
  END IF;
  FOREACH name IN ARRAY ARRAY['cashier_transactions','cashier_payment_migrations'] LOOP
    target := to_regclass(format('%I.%I',app_schema,name));
    IF target IS NULL THEN CONTINUE; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid=target AND relkind='r' AND NOT relispartition)
      OR EXISTS (SELECT 1 FROM pg_inherits WHERE inhrelid=target OR inhparent=target) THEN
      RAISE EXCEPTION 'Incompatible legacy table %',name;
    END IF;
    EXECUTE format('LOCK TABLE %s IN ACCESS EXCLUSIVE MODE',target);
    IF name='cashier_transactions' THEN
      EXECUTE format('SELECT EXISTS (SELECT 1 FROM %s)',target) INTO has_rows;
      IF has_rows THEN RAISE EXCEPTION 'Legacy cashier_transactions is populated; review/export or separately authorized reset required. No rows were removed.'; END IF;
    END IF;
    IF EXISTS (
      WITH expected(table_name,column_name,type_name,not_null,default_value) AS (VALUES
    ('cashier_payment_migrations','name','text',true,NULL),
    ('cashier_transactions','id','integer',true,'nextval(''cashier_transactions_id_seq''::regclass)'),
    ('cashier_transactions','transaction_number','character varying(100)',true,NULL),
    ('cashier_transactions','date_time','character varying(100)',true,NULL),
    ('cashier_transactions','user_name','character varying(150)',true,NULL),
    ('cashier_transactions','business_type','character varying(50)',true,'''Retail''::character varying'),
    ('cashier_transactions','customer','character varying(150)',true,'''Walk-in Customer''::character varying'),
    ('cashier_transactions','total','character varying(50)',true,NULL),
    ('cashier_transactions','subtotal','character varying(50)',true,NULL),
    ('cashier_transactions','discount','character varying(50)',true,'''₱0.00''::character varying'),
    ('cashier_transactions','vat','character varying(50)',true,'''₱0.00''::character varying'),
    ('cashier_transactions','amount_received','character varying(50)',true,'''₱0.00''::character varying'),
    ('cashier_transactions','change','character varying(50)',true,'''₱0.00''::character varying'),
    ('cashier_transactions','payment','character varying(50)',true,'''Cash''::character varying'),
    ('cashier_transactions','status','character varying(50)',true,'''Completed''::character varying'),
    ('cashier_transactions','items','jsonb',true,'''[]''::jsonb'),
    ('cashier_transactions','created_at','timestamp with time zone',true,'now()'),
    ('cashier_transactions','legacy_transaction_number','character varying(100)',false,NULL),
    ('cashier_transactions','checkout_request_key','text',false,NULL),
    ('cashier_transactions','checkout_payload','jsonb',false,NULL)
      ), actual AS (
        SELECT a.attname AS column_name,format_type(a.atttypid,a.atttypmod) AS type_name,
          a.attnotnull AS not_null,pg_get_expr(d.adbin,d.adrelid) AS default_value
        FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
        WHERE a.attrelid=target AND a.attnum>0 AND NOT a.attisdropped
      ) SELECT 1 FROM (SELECT * FROM expected WHERE table_name=name) e FULL JOIN actual a USING(column_name)
      WHERE e.column_name IS NULL OR a.column_name IS NULL OR a.type_name<>e.type_name
        OR a.not_null<>e.not_null OR a.default_value IS DISTINCT FROM e.default_value
    ) THEN RAISE EXCEPTION 'Incompatible legacy columns in %',name; END IF;
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=target AND NOT tgisinternal)
      OR EXISTS (SELECT 1 FROM pg_policy WHERE polrelid=target)
      OR EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=target AND contype<>'n' AND NOT (
        convalidated AND ((conname=name||'_pkey' AND contype='p' AND pg_get_constraintdef(oid,true)=CASE WHEN name='cashier_transactions' THEN 'PRIMARY KEY (id)' ELSE 'PRIMARY KEY (name)' END)
          OR (name='cashier_transactions' AND conname='cashier_transactions_transaction_number_key' AND contype='u' AND pg_get_constraintdef(oid,true)='UNIQUE (transaction_number)'))))
      OR (SELECT count(*) FROM pg_constraint WHERE conrelid=target AND contype<>'n')<>(CASE WHEN name='cashier_transactions' THEN 2 ELSE 1 END)
      OR EXISTS (
        SELECT 1 FROM pg_index i JOIN pg_class idx ON idx.oid=i.indexrelid JOIN pg_class tbl ON tbl.oid=i.indrelid
        JOIN pg_am am ON am.oid=idx.relam LEFT JOIN pg_attribute a ON a.attrelid=target AND a.attnum=i.indkey[0]
        WHERE i.indrelid=target AND NOT (i.indisunique AND i.indisvalid AND i.indisready AND am.amname='btree'
          AND i.indnatts=1 AND i.indnkeyatts=1 AND i.indpred IS NULL AND i.indexprs IS NULL
          AND ((idx.relname=name||'_pkey' AND a.attname=CASE WHEN name='cashier_transactions' THEN 'id' ELSE 'name' END)
            OR (name='cashier_transactions' AND ((idx.relname='cashier_transactions_transaction_number_key' AND a.attname='transaction_number')
              OR (idx.relname='cashier_checkout_request_key_idx' AND a.attname='checkout_request_key'))))))
      OR (SELECT count(*) FROM pg_index WHERE indrelid=target)<>(CASE WHEN name='cashier_transactions' THEN 3 ELSE 1 END)
      OR EXISTS (SELECT 1 FROM pg_depend d JOIN pg_class owned ON owned.oid=d.objid JOIN pg_namespace ns ON ns.oid=owned.relnamespace
        WHERE d.refclassid='pg_class'::regclass AND d.refobjid=target AND d.classid='pg_class'::regclass
          AND d.deptype IN ('a','i') AND owned.relkind='S' AND NOT
          (name='cashier_transactions' AND ns.nspname=app_schema AND owned.relname='cashier_transactions_id_seq'))
    THEN RAISE EXCEPTION 'Unexpected legacy table definition/dependency in %; review required',name; END IF;
    -- RESTRICT refuses views and incoming foreign keys; no cascading business-data drops.
    EXECUTE format('DROP TABLE IF EXISTS %I.%I RESTRICT',app_schema,name);
  END LOOP;
  IF old_sequence IS NOT NULL THEN
    EXECUTE format('ALTER SEQUENCE %I.cashier_receipt_number_seq RENAME TO retail_receipt_number_seq',app_schema);
  ELSIF new_sequence IS NULL THEN
    EXECUTE format('CREATE SEQUENCE %I.retail_receipt_number_seq AS BIGINT',app_schema);
  END IF;
  -- No setval here: preserve existing state without nontransactional migration effects.
END;
$retire$;
