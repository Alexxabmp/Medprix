-- Collection receipts: one numbered acknowledgment per client payment (CR-YYYY-NNNN).
-- Kept in their own table so posted payments (wholesale_collections) stay immutable.
CREATE SEQUENCE wholesale_collection_receipt_seq AS bigint START 1;
--> statement-breakpoint
CREATE TABLE wholesale_collection_receipts (
  collection_id uuid PRIMARY KEY REFERENCES wholesale_collections(id) ON DELETE RESTRICT,
  receipt_number varchar(30) NOT NULL UNIQUE,
  official_receipt_number varchar(100) CHECK (official_receipt_number IS NULL OR length(btrim(official_receipt_number)) BETWEEN 1 AND 100),
  issued_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
-- Receipts can't be changed or deleted; the pharmacy's own official receipt number may be filled in once, later.
CREATE FUNCTION protect_wholesale_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.official_receipt_number IS NULL AND NEW.official_receipt_number IS NOT NULL
     AND NEW.collection_id = OLD.collection_id AND NEW.receipt_number = OLD.receipt_number AND NEW.issued_at = OLD.issued_at THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Collection receipts are immutable' USING ERRCODE = '23514';
END $$;
--> statement-breakpoint
CREATE TRIGGER protect_wholesale_receipts BEFORE UPDATE OR DELETE ON wholesale_collection_receipts
FOR EACH ROW EXECUTE FUNCTION protect_wholesale_receipt();
--> statement-breakpoint
-- Number the payments already recorded, oldest first.
INSERT INTO wholesale_collection_receipts(collection_id, receipt_number, issued_at)
SELECT o.id, 'CR-' || to_char(o.payment_date AT TIME ZONE 'Asia/Manila', 'YYYY') || '-' || lpad(o.n::text, 4, '0'), o.recorded_at
FROM (
  SELECT c.id, p.payment_date, c.recorded_at, row_number() OVER (ORDER BY p.payment_date, c.recorded_at, c.id) AS n
  FROM wholesale_collections c JOIN ar_payments p ON p.id = c.id
) o;
--> statement-breakpoint
SELECT setval('wholesale_collection_receipt_seq', GREATEST((SELECT count(*) FROM wholesale_collection_receipts), 1), (SELECT count(*) FROM wholesale_collection_receipts) > 0);
--> statement-breakpoint
-- Credit hold: confirming an order for a client with an overdue balance needs an Admin decision, bound to the order revision.
CREATE TABLE wholesale_credit_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES wholesale_orders(id) ON DELETE RESTRICT,
  order_revision integer NOT NULL,
  overdue_amount numeric(12,2) NOT NULL CHECK (overdue_amount > 0),
  oldest_due_date date,
  reason varchar(500) NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 500),
  requested_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  requested_at timestamptz NOT NULL DEFAULT now(),
  decision varchar(10) CHECK (decision IN ('Approved', 'Refused')),
  decided_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  decided_at timestamptz,
  decision_note varchar(500) CHECK (decision_note IS NULL OR length(btrim(decision_note)) BETWEEN 3 AND 500),
  CHECK ((decision IS NULL) = (decided_by IS NULL) AND (decision IS NULL) = (decided_at IS NULL) AND (decision IS NULL) = (decision_note IS NULL))
);
--> statement-breakpoint
CREATE INDEX idx_wholesale_credit_approvals_order ON wholesale_credit_approvals(order_id, requested_at);
--> statement-breakpoint
CREATE UNIQUE INDEX uq_wholesale_credit_approvals_pending ON wholesale_credit_approvals(order_id, order_revision) WHERE decision IS NULL;
