-- Fixed authorization uses users.role (Admin/Cashier/FrontDesk), not these grants.
-- Remove the unused metadata; do not derive or overwrite any user's active role.
DO $authorization$
DECLARE
  names text[] := ARRAY['role_permissions','user_roles','permissions','roles'];
  targets oid[] := ARRAY[]::oid[];
  name text;
  target regclass;
  found_count integer := 0;
  item record;
BEGIN
  FOREACH name IN ARRAY names LOOP
    target := to_regclass(format('%I.%I',current_schema(),name));
    IF target IS NOT NULL THEN
      found_count := found_count+1;
      targets := array_append(targets,target::oid);
    END IF;
  END LOOP;
  IF found_count=0 THEN RETURN; END IF;
  IF found_count<>4 THEN RAISE EXCEPTION 'Incomplete legacy authorization schema; review before retirement'; END IF;
  FOREACH name IN ARRAY names LOOP
    EXECUTE format('LOCK TABLE %I.%I IN ACCESS EXCLUSIVE MODE',current_schema(),name);
    target := to_regclass(format('%I.%I',current_schema(),name));
    IF (SELECT count(*) FROM pg_attribute WHERE attrelid=target AND attnum>0 AND NOT attisdropped)<>4 THEN
      RAISE EXCEPTION 'Unexpected columns in legacy authorization table %',name;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=target AND NOT tgisinternal)
      OR EXISTS (SELECT 1 FROM pg_policy WHERE polrelid=target) THEN
      RAISE EXCEPTION 'Unexpected trigger or policy on legacy authorization table %',name;
    END IF;
  END LOOP;
  FOR item IN SELECT * FROM (VALUES
    ('roles','id','uuid',true),('roles','role_name','character varying(100)',true),
    ('roles','description','text',false),('roles','created_at','timestamp with time zone',true),
    ('permissions','id','uuid',true),('permissions','module_name','character varying(100)',true),
    ('permissions','permission_type','character varying(100)',true),('permissions','created_at','timestamp with time zone',true),
    ('user_roles','id','uuid',true),('user_roles','user_id','uuid',true),
    ('user_roles','role_id','uuid',true),('user_roles','assigned_at','timestamp with time zone',true),
    ('role_permissions','id','uuid',true),('role_permissions','role_id','uuid',true),
    ('role_permissions','permission_id','uuid',true),('role_permissions','granted_at','timestamp with time zone',true)
  ) AS expected(table_name,column_name,data_type,not_null) LOOP
    target := to_regclass(format('%I.%I',current_schema(),item.table_name));
    IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid=target AND attname=item.column_name
      AND NOT attisdropped AND format_type(atttypid,atttypmod)=item.data_type AND attnotnull=item.not_null) THEN
      RAISE EXCEPTION 'Incompatible legacy authorization column %.%',item.table_name,item.column_name;
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute a JOIN pg_type t ON t.oid=a.atttypid
    JOIN pg_namespace n ON n.oid=t.typnamespace
    WHERE a.attrelid='users'::regclass AND a.attname='role' AND a.attnotnull
      AND t.typname='user_role_enum' AND n.nspname=current_schema()
      AND (SELECT array_agg(e.enumlabel::text ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid=t.oid)
        = ARRAY['Admin','Cashier','FrontDesk']::text[]) THEN
    RAISE EXCEPTION 'Fixed users.role authority is incompatible; no authorization metadata removed';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE contype='f' AND confrelid=ANY(targets)
    AND NOT conrelid=ANY(targets)) THEN
    RAISE EXCEPTION 'External foreign key depends on legacy authorization tables; review before retirement';
  END IF;
  -- Child tables first. RESTRICT is deliberate: views/other dependencies must
  -- refuse the operation, rolling back any earlier drops in this transaction.
  DROP TABLE IF EXISTS role_permissions;
  DROP TABLE IF EXISTS user_roles;
  DROP TABLE IF EXISTS permissions;
  DROP TABLE IF EXISTS roles;
END;
$authorization$;
