-- New agreements use one Net-30 obligation or two Net-60 obligations.
-- Reset the development database before applying this revision; legacy test data is not converted.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM wholesale_installment_schedules) OR EXISTS (SELECT 1 FROM wholesale_orders WHERE confirmation_snapshot IS NOT NULL) THEN
    RAISE EXCEPTION 'Reset the development database before applying Wholesale terms revision 0021. Legacy test agreements are not converted.';
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE client_contracts ADD COLUMN title varchar(100) NOT NULL DEFAULT 'Client agreement';
ALTER TABLE client_contracts ADD COLUMN revision integer NOT NULL DEFAULT 1;
ALTER TABLE client_contracts ADD CONSTRAINT client_contract_revision_check CHECK (revision > 0);
ALTER TABLE wholesale_orders ADD COLUMN contract_revision integer;
ALTER TABLE wholesale_installment_schedules ADD COLUMN next_payment_date date NOT NULL;
ALTER TABLE wholesale_installments DROP CONSTRAINT wholesale_installment_sequence_check;
ALTER TABLE wholesale_installments ADD CONSTRAINT wholesale_installment_sequence_check CHECK (sequence_number BETWEEN 1 AND 2);
ALTER TABLE wholesale_orders DROP CONSTRAINT wholesale_confirmed_agreement_check;
ALTER TABLE wholesale_orders ADD CONSTRAINT wholesale_confirmed_agreement_check CHECK (
  confirmation_snapshot IS NULL OR (total_order_amount>0 AND payment_plan IS NOT NULL AND (
    confirmation_snapshot->>'paymentPlan'=payment_plan::text
    AND confirmation_snapshot->>'paymentPlanVersion' ='wholesale-terms-v2'
    AND confirmation_snapshot->>'total'=total_order_amount::text
  ) IS TRUE)
);
ALTER TABLE wholesale_installment_schedules DROP CONSTRAINT wholesale_schedule_plan_check;
ALTER TABLE wholesale_installment_schedules DROP CONSTRAINT wholesale_schedule_version_check;
ALTER TABLE wholesale_installment_schedules ADD CONSTRAINT wholesale_schedule_version_check CHECK (plan_version ='wholesale-terms-v2');
ALTER TABLE wholesale_installment_schedules ADD CONSTRAINT wholesale_schedule_plan_check CHECK (
  plan_version='wholesale-terms-v2' AND next_payment_date IS NOT NULL AND next_payment_date>=receipt_date AND (
    (payment_plan='Net30' AND installment_count=1 AND final_due_date=next_payment_date) OR
    (payment_plan='Net60' AND installment_count=2 AND final_due_date>=next_payment_date+30)
  )
);
--> statement-breakpoint
CREATE TABLE wholesale_terms_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES wholesale_orders(id) ON DELETE RESTRICT,
  order_revision integer NOT NULL CHECK (order_revision>0),
  binding jsonb NOT NULL,
  reason text NOT NULL,
  requested_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  requested_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  approved_at timestamptz,
  approval_reason text,
  CHECK ((approved_by IS NULL AND approved_at IS NULL AND approval_reason IS NULL) OR
    (approved_by IS NOT NULL AND approved_at IS NOT NULL AND approval_reason IS NOT NULL))
);
CREATE INDEX idx_wholesale_terms_overrides_order ON wholesale_terms_overrides(order_id,order_revision);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION validate_wholesale_schedule() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  header wholesale_installment_schedules%ROWTYPE;
  source record;
  row_count integer;
  row_total numeric;
  rows_valid boolean;
BEGIN
  SELECT * INTO STRICT header FROM wholesale_installment_schedules WHERE ar_id=NEW.ar_id;
  SELECT f.received_at,o.payment_plan,o.total_order_amount,a.total_owed,a.due_date
    INTO source FROM wholesale_fulfillments f
    JOIN accounts_receivable a ON a.id=f.ar_id AND a.order_id=f.order_id
    JOIN wholesale_orders o ON o.id=f.order_id
    WHERE f.ar_id=NEW.ar_id AND o.confirmation_snapshot IS NOT NULL;
  IF NOT FOUND OR source.received_at IS DISTINCT FROM header.received_at
    OR source.payment_plan IS DISTINCT FROM header.payment_plan
    OR source.total_order_amount IS DISTINCT FROM header.principal
    OR source.total_owed IS DISTINCT FROM header.principal
    OR source.due_date IS DISTINCT FROM header.final_due_date THEN
    RAISE EXCEPTION 'Installment schedule requires matching confirmed receipt and principal' USING ERRCODE='23514';
  END IF;
  SELECT count(*),coalesce(sum(amount),0),bool_and(
    sequence_number BETWEEN 1 AND header.installment_count
    AND due_date=CASE WHEN sequence_number=1 THEN header.next_payment_date ELSE header.final_due_date END
    AND amount=CASE WHEN sequence_number=header.installment_count
      THEN header.principal-trunc(header.principal/header.installment_count,2)*(header.installment_count-1)
      ELSE trunc(header.principal/header.installment_count,2) END
  ) INTO row_count,row_total,rows_valid FROM wholesale_installments WHERE ar_id=NEW.ar_id;
  IF row_count<>header.installment_count OR row_total<>header.principal OR rows_valid IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Wholesale installment schedule is incomplete or inconsistent' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION protect_wholesale_agreement() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.confirmation_snapshot IS NOT NULL THEN
    IF TG_OP='DELETE' THEN
      RAISE EXCEPTION 'Confirmed wholesale agreement is immutable' USING ERRCODE='23514';
    END IF;
    IF (NEW.payment_plan,NEW.total_order_amount,NEW.confirmation_snapshot,NEW.confirmed_at,
        NEW.confirmed_by,NEW.client_id,NEW.contract_id,NEW.contract_revision,NEW.order_number)
      IS DISTINCT FROM
       (OLD.payment_plan,OLD.total_order_amount,OLD.confirmation_snapshot,OLD.confirmed_at,
        OLD.confirmed_by,OLD.client_id,OLD.contract_id,OLD.contract_revision,OLD.order_number) THEN
      RAISE EXCEPTION 'Confirmed wholesale agreement is immutable' USING ERRCODE='23514';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
