-- Approved obsolete retry identity only. Current checkout keys/payloads stay intact.
-- Runner supplies transaction, migration lock and finite statement/lock timeouts.
DO $drop$
DECLARE
  target regclass := 'cashier_transactions'::regclass;
  old_column smallint;
  old_index regclass := to_regclass('cashier_transactions_request_key_idx');
BEGIN
  LOCK TABLE cashier_transactions IN ACCESS EXCLUSIVE MODE;
  SELECT attnum INTO old_column FROM pg_attribute
    WHERE attrelid=target AND attname='request_key' AND NOT attisdropped;
  IF old_column IS NULL THEN
    IF old_index IS NOT NULL THEN RAISE EXCEPTION 'Obsolete key absent but same-named index remains; review required'; END IF;
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE a.attrelid=target AND a.attnum=old_column AND format_type(a.atttypid,a.atttypmod)='character varying(100)'
    AND NOT a.attnotnull AND d.oid IS NULL AND a.attidentity='' AND a.attgenerated='') THEN
    RAISE EXCEPTION 'Unexpected obsolete request_key definition';
  END IF;
  IF EXISTS (SELECT 1 FROM cashier_transactions WHERE request_key IS NOT NULL) THEN
    RAISE EXCEPTION 'Obsolete request_key contains values; explicit data review required';
  END IF;
  IF old_index IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_am am ON am.oid=c.relam
    WHERE i.indexrelid=old_index AND i.indrelid=target AND i.indisunique AND i.indisvalid AND i.indisready
    AND NOT i.indisprimary AND NOT i.indisexclusion AND i.indnkeyatts=1 AND i.indnatts=1
    AND i.indkey[0]=old_column AND i.indpred IS NULL AND i.indexprs IS NULL AND am.amname='btree'
    AND pg_get_indexdef(i.indexrelid,1,true)='request_key'
  ) THEN RAISE EXCEPTION 'Unexpected obsolete request-key index definition'; END IF;
  IF EXISTS (SELECT 1 FROM pg_depend d WHERE d.refclassid='pg_class'::regclass
    AND d.refobjid=target AND d.refobjsubid=old_column
    AND NOT (d.classid='pg_class'::regclass AND d.objid=COALESCE(old_index,0) AND d.deptype='a')) THEN
    RAISE EXCEPTION 'Unexpected dependency on obsolete request_key';
  END IF;
  DROP INDEX IF EXISTS cashier_transactions_request_key_idx;
  ALTER TABLE cashier_transactions DROP COLUMN IF EXISTS request_key;
END;
$drop$;
