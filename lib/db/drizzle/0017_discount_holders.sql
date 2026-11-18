-- Senior citizen / PWD name and ID number for each discounted sale (BIR record of discounted sales).
-- Older discount rows keep NULL; the API requires both for new Senior/PWD sales.
ALTER TABLE discounts ADD COLUMN holder_name varchar(120);
ALTER TABLE discounts ADD COLUMN holder_id_number varchar(40);
ALTER TABLE discounts ADD CONSTRAINT discounts_holder_check CHECK (
  (holder_name IS NULL AND holder_id_number IS NULL)
  OR (btrim(holder_name) <> '' AND btrim(holder_id_number) <> '')
);
