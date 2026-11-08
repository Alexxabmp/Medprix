ALTER TABLE wholesale_orders ADD COLUMN confirmation_snapshot jsonb;
ALTER TABLE wholesale_orders ADD COLUMN confirmed_at timestamptz;
ALTER TABLE wholesale_orders ADD COLUMN confirmed_by uuid REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE wholesale_orders ADD COLUMN cancelled_at timestamptz;
ALTER TABLE wholesale_orders ADD COLUMN cancelled_by uuid REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE wholesale_orders ADD CONSTRAINT wholesale_confirmation_check CHECK (
  (confirmation_snapshot IS NULL AND confirmed_at IS NULL AND confirmed_by IS NULL)
  OR (confirmation_snapshot IS NOT NULL AND jsonb_typeof(confirmation_snapshot)='object'
    AND confirmed_at IS NOT NULL AND confirmed_by IS NOT NULL)
);
--> statement-breakpoint
DO $legacy$
BEGIN
  IF EXISTS (SELECT 1 FROM wholesale_orders WHERE status IN ('Confirmed','Processing')) THEN
    RAISE EXCEPTION 'Existing confirmed/processing wholesale orders require reservation review; no stock was allocated';
  END IF;
END;
$legacy$;
--> statement-breakpoint
CREATE TABLE wholesale_price_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES wholesale_orders(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  order_revision integer NOT NULL CHECK (order_revision > 0),
  binding jsonb NOT NULL,
  requested_price numeric(12,2) NOT NULL CHECK (requested_price >= 0 AND requested_price <= 9999999999.99),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 500),
  requested_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  requested_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  approved_at timestamptz,
  approval_reason text,
  CHECK ((approved_by IS NULL AND approved_at IS NULL AND approval_reason IS NULL)
    OR (approved_by IS NOT NULL AND approved_at IS NOT NULL AND length(btrim(approval_reason)) BETWEEN 1 AND 500))
);
CREATE INDEX idx_wholesale_overrides_order ON wholesale_price_overrides(order_id,order_revision,product_id);
--> statement-breakpoint
CREATE TABLE wholesale_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES wholesale_orders(id) ON DELETE RESTRICT,
  order_item_id uuid NOT NULL REFERENCES wholesale_order_items(id) ON DELETE RESTRICT,
  batch_id uuid NOT NULL REFERENCES batch_info(id) ON DELETE RESTRICT,
  batch_number_at_reservation varchar(100) NOT NULL,
  expiry_at_reservation date NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  reserved_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reserved_at timestamptz NOT NULL DEFAULT now(),
  released_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  released_at timestamptz,
  consumed_at timestamptz,
  CHECK ((released_at IS NULL) = (released_by IS NULL)),
  CHECK (released_at IS NULL OR consumed_at IS NULL),
  UNIQUE (order_item_id,batch_id)
);
CREATE INDEX idx_wholesale_reservations_active_batch ON wholesale_reservations(batch_id)
  WHERE released_at IS NULL AND consumed_at IS NULL;
CREATE INDEX idx_wholesale_reservations_order ON wholesale_reservations(order_id);
--> statement-breakpoint
CREATE FUNCTION protect_wholesale_reserved_batch() RETURNS trigger LANGUAGE plpgsql AS $guard$
DECLARE reserved bigint;
BEGIN
  SELECT COALESCE(sum(quantity),0) INTO reserved FROM wholesale_reservations
    WHERE batch_id=OLD.id AND released_at IS NULL AND consumed_at IS NULL;
  IF NEW.quantity_remaining < reserved THEN
    RAISE EXCEPTION 'Quantity cannot fall below active wholesale reservations' USING ERRCODE='23514';
  END IF;
  IF reserved>0 AND (NEW.expiration_date IS DISTINCT FROM OLD.expiration_date
    OR NEW.product_id IS DISTINCT FROM OLD.product_id
    OR NEW.batch_number IS DISTINCT FROM OLD.batch_number) THEN
    RAISE EXCEPTION 'Reserved batch identity cannot be changed' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$guard$;
CREATE TRIGGER protect_wholesale_reserved_batch BEFORE UPDATE OF quantity_remaining,expiration_date,product_id,batch_number
  ON batch_info FOR EACH ROW EXECUTE FUNCTION protect_wholesale_reserved_batch();
