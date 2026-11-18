-- Rename in place: existing wholesale columns, constraints and data retain
-- their dependency on the same PostgreSQL type.
ALTER TYPE wholesale_payment_plan_enum RENAME TO payment_plan_enum;
--> statement-breakpoint
-- Accept canonical values and the previous spaced spelling. Other terms must
-- be reviewed explicitly; never silently change a supplier's credit agreement.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM suppliers
    WHERE payment_terms IS NULL
      OR btrim(payment_terms) NOT IN ('Net30', 'Net60', 'Net 30', 'Net 60')
  ) THEN
    RAISE EXCEPTION 'Unsupported supplier payment_terms. Set every supplier to Net30 or Net60 before applying migration 0020; NULL and blank terms are not allowed.';
  END IF;
END;
$$;
--> statement-breakpoint
ALTER TABLE suppliers ALTER COLUMN payment_terms TYPE payment_plan_enum
  USING replace(btrim(payment_terms), ' ', '')::payment_plan_enum;
ALTER TABLE suppliers ALTER COLUMN payment_terms SET NOT NULL;
