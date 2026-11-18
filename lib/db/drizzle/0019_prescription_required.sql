-- Prescription-required (Rx) flag (Phase 2c). It only changes what the POS shows: an Rx tag and a reminder.
-- Existing products start as not Rx, except controlled (dangerous) drugs, which always need a prescription.
ALTER TABLE products ADD COLUMN requires_prescription boolean NOT NULL DEFAULT false;
UPDATE products SET requires_prescription = true WHERE is_dangerous_drug;
ALTER TABLE products ADD CONSTRAINT products_dangerous_requires_prescription_check
  CHECK (NOT is_dangerous_drug OR requires_prescription);
