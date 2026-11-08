ALTER TABLE products ADD COLUMN wholesale_price numeric(12,2);
ALTER TABLE products ADD CONSTRAINT products_wholesale_price_check CHECK (wholesale_price >= 0);
--> statement-breakpoint
CREATE SEQUENCE wholesale_order_number_seq;
ALTER TABLE wholesale_orders ADD COLUMN order_number varchar(100);
ALTER TABLE wholesale_orders ADD COLUMN draft_revision integer;
ALTER TABLE wholesale_orders ADD COLUMN created_by uuid REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE wholesale_orders ADD CONSTRAINT wholesale_orders_order_number_key UNIQUE (order_number);
ALTER TABLE wholesale_orders ADD CONSTRAINT wholesale_draft_revision_check CHECK (
  draft_revision IS NULL OR (draft_revision > 0 AND order_number IS NOT NULL AND created_by IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE wholesale_operations (
  id uuid PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  payload jsonb NOT NULL,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
