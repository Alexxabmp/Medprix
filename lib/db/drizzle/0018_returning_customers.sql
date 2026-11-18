-- Returning customers (Phase 2a): who recorded the customer's consent, and their usual order.
-- Older customer rows keep NULL consent; the API requires consent for every new profile.
ALTER TABLE customers ADD COLUMN consent_at timestamptz;
ALTER TABLE customers ADD COLUMN consent_recorded_by uuid;
ALTER TABLE customers ADD CONSTRAINT customers_consent_recorded_by_fkey
  FOREIGN KEY (consent_recorded_by) REFERENCES users(id) ON DELETE SET NULL;

-- Quantities only: prices are always taken from the product at checkout.
-- Deleting a product or a customer removes the matching usual-order lines.
CREATE TABLE customer_usual_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  product_id uuid NOT NULL,
  quantity integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_usual_items_customer_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  CONSTRAINT customer_usual_items_product_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT customer_usual_items_quantity_check CHECK (quantity BETWEEN 1 AND 100000),
  CONSTRAINT uq_customer_usual_items UNIQUE (customer_id, product_id)
);
