ALTER TABLE delivery_schedules ADD COLUMN managed_by uuid REFERENCES users(id) ON DELETE RESTRICT;
--> statement-breakpoint
CREATE UNIQUE INDEX uq_wholesale_active_delivery ON delivery_schedules(order_id)
WHERE managed_by IS NOT NULL AND status IN ('Scheduled','InTransit');
--> statement-breakpoint
CREATE SEQUENCE wholesale_delivery_receipt_seq AS bigint;
--> statement-breakpoint
DO $$
DECLARE highest numeric;
BEGIN
  SELECT coalesce(max(substring(receipt_number FROM 5)::numeric),0) INTO highest
  FROM delivery_receipts WHERE receipt_number ~ '^WDR-[0-9]+$';
  IF highest >= 9223372036854775807 THEN
    RAISE EXCEPTION 'Historical wholesale receipt numbering exceeds the supported sequence. Review before migration.';
  END IF;
  PERFORM setval('wholesale_delivery_receipt_seq', (highest+1)::bigint, false);
END $$;
--> statement-breakpoint
CREATE TABLE wholesale_fulfillments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES wholesale_orders(id) ON DELETE RESTRICT,
  schedule_id uuid NOT NULL UNIQUE REFERENCES delivery_schedules(id) ON DELETE RESTRICT,
  receipt_id uuid NOT NULL UNIQUE REFERENCES delivery_receipts(id) ON DELETE RESTRICT,
  ar_id uuid NOT NULL UNIQUE REFERENCES accounts_receivable(id) ON DELETE RESTRICT,
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot)='object'),
  delivered_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  delivered_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE FUNCTION protect_wholesale_fulfillment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Wholesale fulfillment is immutable' USING ERRCODE='23514';
END $$;
--> statement-breakpoint
CREATE TRIGGER protect_wholesale_fulfillment BEFORE UPDATE OR DELETE ON wholesale_fulfillments
FOR EACH ROW EXECUTE FUNCTION protect_wholesale_fulfillment();
