CREATE TABLE product_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(100) NOT NULL UNIQUE CHECK (btrim(name) <> ''),
  is_vat boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX uq_product_categories_name_ci ON product_categories (lower(btrim(name)));
ALTER TABLE products ADD COLUMN initial_price numeric(12,2) NOT NULL;
ALTER TABLE products ADD CONSTRAINT products_initial_price_check CHECK (initial_price >= 0);
ALTER TABLE products ADD CONSTRAINT products_category_fk FOREIGN KEY(category)
  REFERENCES product_categories(name) ON UPDATE CASCADE ON DELETE RESTRICT;
CREATE FUNCTION derive_product_category_price() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE taxable boolean;
BEGIN
  IF NEW.initial_price IS NULL THEN
    RAISE EXCEPTION 'initial_price is required' USING ERRCODE = '23502';
  END IF;
  SELECT is_vat INTO STRICT taxable FROM product_categories WHERE name = NEW.category FOR SHARE;
  NEW.is_vat_exempt := NOT taxable;
  -- These are derived projections used by inventory, checkout and wholesale reads.
  NEW.selling_price := round(NEW.initial_price * CASE WHEN taxable THEN 1.12 ELSE 1 END, 2);
  RETURN NEW;
END $$;
CREATE TRIGGER derive_product_category_price BEFORE INSERT OR UPDATE OF category, initial_price, selling_price, is_vat_exempt ON products
FOR EACH ROW EXECUTE FUNCTION derive_product_category_price();
CREATE FUNCTION refresh_category_prices() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Re-run the product pricing trigger when the category VAT checkbox changes.
  UPDATE products SET initial_price = initial_price WHERE category = NEW.name;
  RETURN NEW;
END $$;
CREATE TRIGGER refresh_category_prices AFTER UPDATE OF is_vat ON product_categories
FOR EACH ROW WHEN (OLD.is_vat IS DISTINCT FROM NEW.is_vat) EXECUTE FUNCTION refresh_category_prices();
