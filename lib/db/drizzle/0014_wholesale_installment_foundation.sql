CREATE TYPE wholesale_payment_plan_enum AS ENUM ('Net30','Net60');
--> statement-breakpoint
ALTER TABLE wholesale_orders ADD COLUMN payment_plan wholesale_payment_plan_enum;
ALTER TABLE wholesale_orders ADD CONSTRAINT wholesale_confirmed_agreement_check CHECK (
  confirmation_snapshot IS NULL OR (total_order_amount>0 AND payment_plan IS NOT NULL AND (
    confirmation_snapshot->>'paymentPlan'=payment_plan::text
    AND confirmation_snapshot->>'paymentPlanVersion'='wholesale-installments-v1'
    AND confirmation_snapshot->>'total'=total_order_amount::text
  ) IS TRUE)
);
ALTER TABLE accounts_receivable ADD CONSTRAINT wholesale_ar_balance_equation_check
  CHECK (total_paid<=total_owed AND balance=total_owed-total_paid);
ALTER TABLE ar_payments ADD CONSTRAINT wholesale_payment_id_ar_key UNIQUE(id,ar_id);
--> statement-breakpoint
ALTER TABLE delivery_schedules ADD COLUMN dispatched_at timestamptz;
-- Staged receipt capture: checkpoint 2 populates received_at before activation.
-- No default is allowed to substitute entry time for actual client receipt.
ALTER TABLE wholesale_fulfillments ADD COLUMN received_at timestamptz;
ALTER TABLE wholesale_fulfillments ADD COLUMN recorded_at timestamptz NOT NULL DEFAULT now();
--> statement-breakpoint
CREATE TABLE wholesale_installment_schedules (
  ar_id uuid PRIMARY KEY REFERENCES wholesale_fulfillments(ar_id) ON DELETE RESTRICT,
  payment_plan wholesale_payment_plan_enum NOT NULL,
  plan_version varchar(32) NOT NULL,
  principal numeric(12,2) NOT NULL,
  installment_count integer NOT NULL,
  received_at timestamptz NOT NULL,
  receipt_date date NOT NULL,
  final_due_date date NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wholesale_schedule_plan_check CHECK (
    (payment_plan='Net30' AND installment_count=4 AND final_due_date=receipt_date+30)
    OR (payment_plan='Net60' AND installment_count=8 AND final_due_date=receipt_date+60)
  ),
  CONSTRAINT wholesale_schedule_version_check CHECK (plan_version='wholesale-installments-v1'),
  CONSTRAINT wholesale_schedule_principal_check CHECK (principal>0 AND principal<=9999999999.99),
  CONSTRAINT wholesale_schedule_receipt_check CHECK (receipt_date=(received_at AT TIME ZONE 'Asia/Manila')::date)
);
--> statement-breakpoint
CREATE TABLE wholesale_installments (
  ar_id uuid NOT NULL REFERENCES wholesale_installment_schedules(ar_id) ON DELETE RESTRICT,
  sequence_number integer NOT NULL,
  due_date date NOT NULL,
  amount numeric(12,2) NOT NULL,
  PRIMARY KEY(ar_id,sequence_number),
  CONSTRAINT wholesale_installment_sequence_check CHECK (sequence_number BETWEEN 1 AND 8),
  CONSTRAINT wholesale_installment_amount_check CHECK (amount>=0 AND amount<=9999999999.99)
);
CREATE INDEX idx_wholesale_installments_due ON wholesale_installments(due_date,ar_id);
--> statement-breakpoint
CREATE TABLE wholesale_payment_allocations (
  payment_id uuid NOT NULL REFERENCES wholesale_collections(id) ON DELETE RESTRICT,
  ar_id uuid NOT NULL,
  sequence_number integer NOT NULL,
  amount numeric(12,2) NOT NULL,
  PRIMARY KEY(payment_id,sequence_number),
  CONSTRAINT wholesale_allocation_payment_ar_fk FOREIGN KEY(payment_id,ar_id)
    REFERENCES ar_payments(id,ar_id) ON DELETE RESTRICT,
  CONSTRAINT wholesale_allocation_installment_fk FOREIGN KEY(ar_id,sequence_number)
    REFERENCES wholesale_installments(ar_id,sequence_number) ON DELETE RESTRICT,
  CONSTRAINT wholesale_allocation_amount_check CHECK (amount>0 AND amount<=9999999999.99)
);
CREATE INDEX idx_wholesale_allocations_installment ON wholesale_payment_allocations(ar_id,sequence_number);
--> statement-breakpoint
CREATE FUNCTION protect_wholesale_agreement() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.confirmation_snapshot IS NOT NULL THEN
    IF TG_OP='DELETE' THEN
      RAISE EXCEPTION 'Confirmed wholesale agreement is immutable' USING ERRCODE='23514';
    END IF;
    IF (NEW.payment_plan,NEW.total_order_amount,NEW.confirmation_snapshot,NEW.confirmed_at,
        NEW.confirmed_by,NEW.client_id,NEW.contract_id,NEW.order_number)
      IS DISTINCT FROM
       (OLD.payment_plan,OLD.total_order_amount,OLD.confirmation_snapshot,OLD.confirmed_at,
        OLD.confirmed_by,OLD.client_id,OLD.contract_id,OLD.order_number) THEN
      RAISE EXCEPTION 'Confirmed wholesale agreement is immutable' USING ERRCODE='23514';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER protect_wholesale_agreement BEFORE UPDATE OR DELETE ON wholesale_orders
FOR EACH ROW EXECUTE FUNCTION protect_wholesale_agreement();
--> statement-breakpoint
CREATE FUNCTION protect_wholesale_receivable_terms() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM wholesale_fulfillments WHERE ar_id=OLD.id)
    AND (NEW.client_id,NEW.order_id,NEW.total_owed,NEW.due_date)
      IS DISTINCT FROM (OLD.client_id,OLD.order_id,OLD.total_owed,OLD.due_date) THEN
    RAISE EXCEPTION 'Posted wholesale receivable terms are immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_wholesale_receivable_terms BEFORE UPDATE ON accounts_receivable
FOR EACH ROW EXECUTE FUNCTION protect_wholesale_receivable_terms();
--> statement-breakpoint
CREATE FUNCTION protect_wholesale_installment_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Wholesale installment history is immutable' USING ERRCODE='23514';
END $$;
CREATE TRIGGER protect_wholesale_schedule BEFORE UPDATE OR DELETE ON wholesale_installment_schedules
FOR EACH ROW EXECUTE FUNCTION protect_wholesale_installment_history();
CREATE TRIGGER protect_wholesale_installments BEFORE UPDATE OR DELETE ON wholesale_installments
FOR EACH ROW EXECUTE FUNCTION protect_wholesale_installment_history();
CREATE TRIGGER protect_wholesale_allocations BEFORE UPDATE OR DELETE ON wholesale_payment_allocations
FOR EACH ROW EXECUTE FUNCTION protect_wholesale_installment_history();

CREATE FUNCTION validate_wholesale_schedule() RETURNS trigger LANGUAGE plpgsql AS $$
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
    AND due_date=header.receipt_date+7*sequence_number
    AND amount=CASE WHEN sequence_number=header.installment_count
      THEN header.principal-trunc(header.principal/header.installment_count,2)*(header.installment_count-1)
      ELSE trunc(header.principal/header.installment_count,2) END
  ) INTO row_count,row_total,rows_valid FROM wholesale_installments WHERE ar_id=NEW.ar_id;
  IF row_count<>header.installment_count OR row_total<>header.principal OR rows_valid IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Wholesale installment schedule is incomplete or inconsistent' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER validate_wholesale_schedule_header AFTER INSERT ON wholesale_installment_schedules
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_wholesale_schedule();
CREATE CONSTRAINT TRIGGER validate_wholesale_schedule_rows AFTER INSERT ON wholesale_installments
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_wholesale_schedule();
