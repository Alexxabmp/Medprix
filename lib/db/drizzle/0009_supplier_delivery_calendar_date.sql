-- Approved calendar-date policy: Philippine calendar day of retained stored instants.
-- Review the read-only conversion preview before applying to retained local data.
DO $calendar$
DECLARE target regclass := format('%I.supplier_deliveries',current_schema())::regclass;
  shape record; invalid boolean;
BEGIN
  LOCK TABLE supplier_deliveries IN ACCESS EXCLUSIVE MODE;
  SELECT format_type(a.atttypid,a.atttypmod) AS type_name,a.attnotnull,
    pg_get_expr(d.adbin,d.adrelid) AS default_value INTO shape
  FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
  WHERE a.attrelid=target AND a.attname='delivery_date' AND NOT a.attisdropped;
  IF NOT FOUND THEN RAISE EXCEPTION 'Missing supplier delivery_date'; END IF;
  IF shape.type_name='date' AND shape.attnotnull AND shape.default_value IS NULL THEN
    IF EXISTS (SELECT 1 FROM supplier_deliveries WHERE NOT isfinite(delivery_date) OR delivery_date NOT BETWEEN DATE '0001-01-01' AND DATE '9999-12-31') THEN
      RAISE EXCEPTION 'Unsupported existing calendar delivery date';
    END IF;
    RETURN;
  END IF;
  IF shape.type_name<>'timestamp with time zone' OR NOT shape.attnotnull OR shape.default_value IS DISTINCT FROM 'now()' THEN
    RAISE EXCEPTION 'Incompatible supplier delivery_date definition';
  END IF;
  SELECT EXISTS (SELECT 1 FROM supplier_deliveries WHERE NOT isfinite(delivery_date)
    OR (delivery_date AT TIME ZONE 'Asia/Manila')::date NOT BETWEEN DATE '0001-01-01' AND DATE '9999-12-31') INTO invalid;
  IF invalid THEN RAISE EXCEPTION 'Unsupported historical delivery date; no conversion performed'; END IF;
  ALTER TABLE supplier_deliveries ALTER COLUMN delivery_date DROP DEFAULT;
  ALTER TABLE supplier_deliveries ALTER COLUMN delivery_date TYPE date
    USING (delivery_date AT TIME ZONE 'Asia/Manila')::date;
END;
$calendar$;
