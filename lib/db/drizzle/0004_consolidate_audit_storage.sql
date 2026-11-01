-- Canonical system_logs/user_activities already exist in the baseline.
-- Retire only the two duplicate public stores. Preserve populated legacy tables
-- verbatim in an operator archive rather than infer dates, actors or deduplication.
-- Runner supplies transaction, migration lock and finite lock/statement timeouts.
DO $audit$
DECLARE
  app_schema text := current_schema();
  archive_schema text := CASE WHEN current_schema()='public' THEN 'medprix_audit_archive'
    ELSE current_schema() || '_audit_archive' END;
  source_name text;
  source_table regclass;
  old_count bigint;
  archived_count bigint;
BEGIN
  FOREACH source_name IN ARRAY ARRAY['cashier_system_logs','cashier_user_activities'] LOOP
    source_table := to_regclass(format('%I.%I',app_schema,source_name));
    IF source_table IS NULL THEN CONTINUE; END IF;
    EXECUTE format('LOCK TABLE %I.%I IN ACCESS EXCLUSIVE MODE',app_schema,source_name);
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=source_table AND NOT tgisinternal)
      OR EXISTS (SELECT 1 FROM pg_constraint WHERE confrelid=source_table OR (conrelid=source_table AND contype<>'p'))
      OR EXISTS (SELECT 1 FROM pg_depend d WHERE d.refclassid='pg_class'::regclass AND d.refobjid=source_table
        AND d.classid NOT IN ('pg_class'::regclass,'pg_type'::regclass,'pg_attrdef'::regclass)
        AND NOT (d.classid='pg_constraint'::regclass AND EXISTS (
          SELECT 1 FROM pg_constraint k WHERE k.oid=d.objid AND k.conrelid=source_table AND k.contype='p'))) THEN
      RAISE EXCEPTION 'Unexpected dependency on legacy audit table %; review required',source_name;
    END IF;
    IF to_regclass(format('%I.%I',archive_schema,source_name)) IS NOT NULL THEN
      RAISE EXCEPTION 'Legacy audit archive collision for %; no overwrite allowed',source_name;
    END IF;
    EXECUTE format('SELECT count(*) FROM %I.%I',app_schema,source_name) INTO old_count;
    IF old_count=0 THEN
      EXECUTE format('DROP TABLE IF EXISTS %I.%I',app_schema,source_name);
    ELSE
      IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname=archive_schema AND nspowner<>current_user::regrole) THEN
        RAISE EXCEPTION 'Archive schema has an unexpected owner';
      END IF;
      EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I',archive_schema);
      EXECUTE format('REVOKE ALL ON SCHEMA %I FROM PUBLIC',archive_schema);
      EXECUTE format('ALTER TABLE %I.%I SET SCHEMA %I',app_schema,source_name,archive_schema);
      EXECUTE format('SELECT count(*) FROM %I.%I',archive_schema,source_name) INTO archived_count;
      IF archived_count<>old_count THEN RAISE EXCEPTION 'Legacy audit archive count mismatch'; END IF;
    END IF;
  END LOOP;
END;
$audit$;
