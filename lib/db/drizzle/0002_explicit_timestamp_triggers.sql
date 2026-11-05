-- Refuse overwriting an unrelated same-named function.
DO $guard$
DECLARE existing regprocedure := to_regprocedure('public.update_updated_at_column()');
BEGIN
  IF existing IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=existing
    AND l.lanname='plpgsql' AND p.prorettype='trigger'::regtype AND NOT p.prosecdef
    AND regexp_replace(lower(p.prosrc),'[[:space:]]','','g')='beginnew.updated_at=current_timestamp;returnnew;end;'
  ) THEN RAISE EXCEPTION 'Unexpected update_updated_at_column function; review required'; END IF;
END;
$guard$;
-- Explicit timestamp maintenance previously installed by an ad hoc utility.
CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS trigger AS $fn$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;
DO $guard_trigger$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.accounts_payable'::regclass AND tgname='trg_accounts_payable_updated_at'
    AND (tgisinternal OR tgenabled<>'O' OR pg_get_triggerdef(oid,true)<>'CREATE TRIGGER trg_accounts_payable_updated_at BEFORE UPDATE ON accounts_payable FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()')) THEN
    RAISE EXCEPTION 'Unexpected timestamp trigger trg_accounts_payable_updated_at; review required';
  END IF;
END; $guard_trigger$;
DROP TRIGGER IF EXISTS "trg_accounts_payable_updated_at" ON public."accounts_payable";
CREATE TRIGGER "trg_accounts_payable_updated_at" BEFORE UPDATE ON public."accounts_payable" FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DO $guard_trigger$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.accounts_receivable'::regclass AND tgname='trg_accounts_receivable_updated_at'
    AND (tgisinternal OR tgenabled<>'O' OR pg_get_triggerdef(oid,true)<>'CREATE TRIGGER trg_accounts_receivable_updated_at BEFORE UPDATE ON accounts_receivable FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()')) THEN
    RAISE EXCEPTION 'Unexpected timestamp trigger trg_accounts_receivable_updated_at; review required';
  END IF;
END; $guard_trigger$;
DROP TRIGGER IF EXISTS "trg_accounts_receivable_updated_at" ON public."accounts_receivable";
CREATE TRIGGER "trg_accounts_receivable_updated_at" BEFORE UPDATE ON public."accounts_receivable" FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DO $guard_trigger$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.batch_info'::regclass AND tgname='trg_batch_info_updated_at'
    AND (tgisinternal OR tgenabled<>'O' OR pg_get_triggerdef(oid,true)<>'CREATE TRIGGER trg_batch_info_updated_at BEFORE UPDATE ON batch_info FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()')) THEN
    RAISE EXCEPTION 'Unexpected timestamp trigger trg_batch_info_updated_at; review required';
  END IF;
END; $guard_trigger$;
DROP TRIGGER IF EXISTS "trg_batch_info_updated_at" ON public."batch_info";
CREATE TRIGGER "trg_batch_info_updated_at" BEFORE UPDATE ON public."batch_info" FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DO $guard_trigger$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.client_contracts'::regclass AND tgname='trg_client_contracts_updated_at'
    AND (tgisinternal OR tgenabled<>'O' OR pg_get_triggerdef(oid,true)<>'CREATE TRIGGER trg_client_contracts_updated_at BEFORE UPDATE ON client_contracts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()')) THEN
    RAISE EXCEPTION 'Unexpected timestamp trigger trg_client_contracts_updated_at; review required';
  END IF;
END; $guard_trigger$;
DROP TRIGGER IF EXISTS "trg_client_contracts_updated_at" ON public."client_contracts";
CREATE TRIGGER "trg_client_contracts_updated_at" BEFORE UPDATE ON public."client_contracts" FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DO $guard_trigger$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.customers'::regclass AND tgname='trg_customers_updated_at'
    AND (tgisinternal OR tgenabled<>'O' OR pg_get_triggerdef(oid,true)<>'CREATE TRIGGER trg_customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()')) THEN
    RAISE EXCEPTION 'Unexpected timestamp trigger trg_customers_updated_at; review required';
  END IF;
END; $guard_trigger$;
DROP TRIGGER IF EXISTS "trg_customers_updated_at" ON public."customers";
CREATE TRIGGER "trg_customers_updated_at" BEFORE UPDATE ON public."customers" FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DO $guard_trigger$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.dashboards'::regclass AND tgname='trg_dashboards_updated_at'
    AND (tgisinternal OR tgenabled<>'O' OR pg_get_triggerdef(oid,true)<>'CREATE TRIGGER trg_dashboards_updated_at BEFORE UPDATE ON dashboards FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()')) THEN
    RAISE EXCEPTION 'Unexpected timestamp trigger trg_dashboards_updated_at; review required';
  END IF;
END; $guard_trigger$;
DROP TRIGGER IF EXISTS "trg_dashboards_updated_at" ON public."dashboards";
CREATE TRIGGER "trg_dashboards_updated_at" BEFORE UPDATE ON public."dashboards" FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DO $guard_trigger$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.products'::regclass AND tgname='trg_products_updated_at'
    AND (tgisinternal OR tgenabled<>'O' OR pg_get_triggerdef(oid,true)<>'CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()')) THEN
    RAISE EXCEPTION 'Unexpected timestamp trigger trg_products_updated_at; review required';
  END IF;
END; $guard_trigger$;
DROP TRIGGER IF EXISTS "trg_products_updated_at" ON public."products";
CREATE TRIGGER "trg_products_updated_at" BEFORE UPDATE ON public."products" FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DO $guard_trigger$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.purchase_orders'::regclass AND tgname='trg_purchase_orders_updated_at'
    AND (tgisinternal OR tgenabled<>'O' OR pg_get_triggerdef(oid,true)<>'CREATE TRIGGER trg_purchase_orders_updated_at BEFORE UPDATE ON purchase_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()')) THEN
    RAISE EXCEPTION 'Unexpected timestamp trigger trg_purchase_orders_updated_at; review required';
  END IF;
END; $guard_trigger$;
DROP TRIGGER IF EXISTS "trg_purchase_orders_updated_at" ON public."purchase_orders";
CREATE TRIGGER "trg_purchase_orders_updated_at" BEFORE UPDATE ON public."purchase_orders" FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DO $guard_trigger$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.suppliers'::regclass AND tgname='trg_suppliers_updated_at'
    AND (tgisinternal OR tgenabled<>'O' OR pg_get_triggerdef(oid,true)<>'CREATE TRIGGER trg_suppliers_updated_at BEFORE UPDATE ON suppliers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()')) THEN
    RAISE EXCEPTION 'Unexpected timestamp trigger trg_suppliers_updated_at; review required';
  END IF;
END; $guard_trigger$;
DROP TRIGGER IF EXISTS "trg_suppliers_updated_at" ON public."suppliers";
CREATE TRIGGER "trg_suppliers_updated_at" BEFORE UPDATE ON public."suppliers" FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DO $guard_trigger$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.transactions'::regclass AND tgname='trg_transactions_updated_at'
    AND (tgisinternal OR tgenabled<>'O' OR pg_get_triggerdef(oid,true)<>'CREATE TRIGGER trg_transactions_updated_at BEFORE UPDATE ON transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()')) THEN
    RAISE EXCEPTION 'Unexpected timestamp trigger trg_transactions_updated_at; review required';
  END IF;
END; $guard_trigger$;
DROP TRIGGER IF EXISTS "trg_transactions_updated_at" ON public."transactions";
CREATE TRIGGER "trg_transactions_updated_at" BEFORE UPDATE ON public."transactions" FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DO $guard_trigger$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.users'::regclass AND tgname='trg_users_updated_at'
    AND (tgisinternal OR tgenabled<>'O' OR pg_get_triggerdef(oid,true)<>'CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()')) THEN
    RAISE EXCEPTION 'Unexpected timestamp trigger trg_users_updated_at; review required';
  END IF;
END; $guard_trigger$;
DROP TRIGGER IF EXISTS "trg_users_updated_at" ON public."users";
CREATE TRIGGER "trg_users_updated_at" BEFORE UPDATE ON public."users" FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DO $guard_trigger$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.wholesale_clients'::regclass AND tgname='trg_wholesale_clients_updated_at'
    AND (tgisinternal OR tgenabled<>'O' OR pg_get_triggerdef(oid,true)<>'CREATE TRIGGER trg_wholesale_clients_updated_at BEFORE UPDATE ON wholesale_clients FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()')) THEN
    RAISE EXCEPTION 'Unexpected timestamp trigger trg_wholesale_clients_updated_at; review required';
  END IF;
END; $guard_trigger$;
DROP TRIGGER IF EXISTS "trg_wholesale_clients_updated_at" ON public."wholesale_clients";
CREATE TRIGGER "trg_wholesale_clients_updated_at" BEFORE UPDATE ON public."wholesale_clients" FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DO $guard_trigger$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.wholesale_orders'::regclass AND tgname='trg_wholesale_orders_updated_at'
    AND (tgisinternal OR tgenabled<>'O' OR pg_get_triggerdef(oid,true)<>'CREATE TRIGGER trg_wholesale_orders_updated_at BEFORE UPDATE ON wholesale_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()')) THEN
    RAISE EXCEPTION 'Unexpected timestamp trigger trg_wholesale_orders_updated_at; review required';
  END IF;
END; $guard_trigger$;
DROP TRIGGER IF EXISTS "trg_wholesale_orders_updated_at" ON public."wholesale_orders";
CREATE TRIGGER "trg_wholesale_orders_updated_at" BEFORE UPDATE ON public."wholesale_orders" FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
