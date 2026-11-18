-- Proof of non-cash payment: GCash / QR reference number or card terminal approval code.
-- Existing GCash and Card sales keep NULL (shown as "Not recorded"); the API requires it for new ones.
ALTER TABLE transactions ADD COLUMN payment_reference varchar(32);
ALTER TABLE transactions ADD CONSTRAINT transactions_payment_reference_check CHECK (
  payment_reference IS NULL
  OR (payment_method = 'GCash' AND payment_reference ~ '^[0-9]{10,13}$')
  OR (payment_method = 'Card' AND payment_reference ~ '^[A-Z0-9]{6}$')
);
-- The same GCash reference or card approval code cannot be recorded on two sales.
CREATE UNIQUE INDEX uq_transactions_payment_reference ON transactions (payment_method, payment_reference)
  WHERE payment_reference IS NOT NULL;
