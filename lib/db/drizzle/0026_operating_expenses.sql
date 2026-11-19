-- Operating expenses (rent, utilities, salaries, ...) so the financial summary can show net income.
-- Supplier purchases are NOT recorded here: they reach profit through cost of goods sold when sold.
-- Entries are never deleted; a mistake is voided with a reason.
CREATE TABLE operating_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_date date NOT NULL,
  category varchar(30) NOT NULL CHECK (category IN ('Rent', 'Utilities', 'Salaries', 'Supplies', 'PermitsTaxes', 'Maintenance', 'Transport', 'Other')),
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  payee varchar(120),
  reference_number varchar(100),
  description varchar(500) NOT NULL CHECK (length(btrim(description)) >= 3),
  recorded_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz,
  voided_by uuid REFERENCES users(id) ON DELETE SET NULL,
  void_reason varchar(500),
  CONSTRAINT operating_expenses_void_check CHECK ((voided_at IS NULL) = (void_reason IS NULL))
);
--> statement-breakpoint
CREATE INDEX idx_operating_expenses_date ON operating_expenses (expense_date) WHERE voided_at IS NULL;
