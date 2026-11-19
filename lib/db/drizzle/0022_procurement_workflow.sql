-- Procurement workflow: supplier terms, approval history, receiving details,
-- invoice verification and payment details. Purely additive except the supplier
-- terms type, which widens Net30/Net60 to five supplier-only options.
-- Wholesale keeps payment_plan_enum (Net30/Net60) unchanged.

CREATE TYPE supplier_terms_enum AS ENUM ('Immediate', 'EndOfMonth', 'EndOfNextMonth', 'Net30', 'Net60');
--> statement-breakpoint
CREATE TYPE supplier_terms_basis_enum AS ENUM ('InvoiceDate', 'DeliveryDate');
--> statement-breakpoint
CREATE TYPE supplier_invoice_status_enum AS ENUM ('PendingVerification', 'Verified');
--> statement-breakpoint
ALTER TABLE suppliers ALTER COLUMN payment_terms TYPE supplier_terms_enum
  USING payment_terms::text::supplier_terms_enum;
--> statement-breakpoint
ALTER TABLE suppliers ADD COLUMN terms_basis supplier_terms_basis_enum NOT NULL DEFAULT 'InvoiceDate';
--> statement-breakpoint

-- Purchase orders: who created/approved/sent it, and when.
ALTER TABLE purchase_orders
  ADD COLUMN created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN approved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN approved_at timestamptz,
  ADD COLUMN self_approved boolean NOT NULL DEFAULT false,
  ADD COLUMN sent_at timestamptz,
  ADD COLUMN sent_method varchar(20),
  ADD COLUMN sent_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN expected_delivery_date date,
  ADD COLUMN notes text,
  ADD COLUMN closed_at timestamptz,
  ADD COLUMN close_reason text,
  ADD CONSTRAINT purchase_orders_sent_method_check
    CHECK (sent_method IS NULL OR sent_method IN ('Viber', 'SMS', 'Email', 'Phone', 'Printed', 'Other')),
  ADD CONSTRAINT purchase_orders_notes_check CHECK (notes IS NULL OR length(notes) <= 1000),
  ADD CONSTRAINT purchase_orders_close_reason_check CHECK (close_reason IS NULL OR length(close_reason) <= 500);
--> statement-breakpoint

-- Approval and change history, one row per step. Never updated or deleted by the app.
CREATE TABLE purchase_order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  event_type varchar(40) NOT NULL,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_name varchar(255),
  actor_role varchar(30),
  details text,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX idx_purchase_order_events_po_id ON purchase_order_events (po_id, created_at);
--> statement-breakpoint

-- Receiving: the supplier's delivery receipt number, notes, who received it.
ALTER TABLE supplier_deliveries
  ADD COLUMN receipt_number varchar(100),
  ADD COLUMN notes text,
  ADD COLUMN received_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD CONSTRAINT supplier_deliveries_notes_check CHECK (notes IS NULL OR length(notes) <= 1000);
--> statement-breakpoint

-- Units refused at the door. They never enter stock and stay due on the order.
CREATE TABLE delivery_rejections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id uuid NOT NULL REFERENCES supplier_deliveries(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity > 0),
  reason varchar(20) NOT NULL CHECK (reason IN ('Damaged', 'Expired', 'ShortExpiry', 'WrongItem', 'Other')),
  batch_number varchar(100),
  expiration_date date,
  notes text CHECK (notes IS NULL OR length(notes) <= 500),
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX idx_delivery_rejections_delivery_id ON delivery_rejections (delivery_id);
--> statement-breakpoint

-- Invoices: own date, copied terms, verification.
ALTER TABLE supplier_invoices
  ADD COLUMN invoice_date date,
  ADD COLUMN status supplier_invoice_status_enum NOT NULL DEFAULT 'Verified',
  ADD COLUMN terms supplier_terms_enum,
  ADD COLUMN terms_basis supplier_terms_basis_enum,
  ADD COLUMN terms_override_reason text,
  ADD COLUMN variance_reason text,
  ADD COLUMN recorded_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN verified_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN verified_at timestamptz;
--> statement-breakpoint
-- Existing invoices were all treated as payable already, so they are Verified,
-- keep their due dates, and copy their supplier's terms.
UPDATE supplier_invoices i
SET invoice_date = (i.created_at AT TIME ZONE 'Asia/Manila')::date,
    terms = s.payment_terms,
    terms_basis = s.terms_basis,
    verified_at = i.created_at
FROM suppliers s
WHERE s.id = i.supplier_id;
--> statement-breakpoint
ALTER TABLE supplier_invoices
  ALTER COLUMN invoice_date SET NOT NULL,
  ALTER COLUMN terms SET NOT NULL,
  ALTER COLUMN terms_basis SET NOT NULL,
  ADD CONSTRAINT supplier_invoices_terms_override_reason_check
    CHECK (terms_override_reason IS NULL OR length(terms_override_reason) BETWEEN 3 AND 500),
  ADD CONSTRAINT supplier_invoices_variance_reason_check
    CHECK (variance_reason IS NULL OR length(variance_reason) BETWEEN 3 AND 500);
--> statement-breakpoint

-- Payments: how it was paid, the proof, and the payment advice sent to the supplier.
CREATE SEQUENCE supplier_payment_advice_seq AS bigint START 1;
--> statement-breakpoint
ALTER TABLE supplier_payments
  ADD COLUMN payment_mode varchar(20),
  ADD COLUMN reference_number varchar(100),
  ADD COLUMN supplier_or_number varchar(100),
  ADD COLUMN advice_number varchar(30),
  ADD COLUMN recorded_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN is_prepayment boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT supplier_payments_payment_mode_check
    CHECK (payment_mode IS NULL OR payment_mode IN ('Cash', 'BankTransfer', 'Check', 'GCash', 'Maya')),
  ADD CONSTRAINT supplier_payments_reference_check
    CHECK (payment_mode IS NULL OR payment_mode = 'Cash' OR reference_number IS NOT NULL),
  ADD CONSTRAINT supplier_payments_advice_number_key UNIQUE (advice_number);
