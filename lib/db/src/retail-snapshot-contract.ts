// PostgreSQL-parsed CHECK definitions for migration 0007. No runtime DDL.
export const retailSnapshotChecks = [
  {
    table_name: "transactions",
    name: "retail_transaction_snapshot_check",
    definition:
      "CHECK (calculation_version IS NULL OR calculation_version::text = 'retail-inclusive-v1'::text AND checkout_payload IS NOT NULL AND jsonb_typeof(checkout_payload) = 'object'::text AND cashier_id IS NOT NULL AND cashier_name_at_sale IS NOT NULL AND btrim(cashier_name_at_sale::text) <> ''::text AND gross_amount >= 0::numeric AND total_discount >= 0::numeric AND vat_amount >= 0::numeric AND net_amount >= 0::numeric AND (net_amount + total_discount) <= gross_amount AND vat_amount <= net_amount AND amount_tendered >= net_amount AND change_amount = (amount_tendered - net_amount))",
  },
  {
    table_name: "transaction_items",
    name: "retail_item_snapshot_check",
    definition:
      "CHECK (product_name_at_sale IS NULL AND is_vat_exempt_at_sale IS NULL AND vat_rate_at_sale IS NULL AND vat_amount IS NULL AND net_amount IS NULL AND discount_amount IS NULL OR product_name_at_sale IS NOT NULL AND btrim(product_name_at_sale::text) <> ''::text AND is_vat_exempt_at_sale IS NOT NULL AND vat_rate_at_sale IS NOT NULL AND vat_amount IS NOT NULL AND net_amount IS NOT NULL AND discount_amount IS NOT NULL AND vat_amount >= 0::numeric AND net_amount >= 0::numeric AND discount_amount >= 0::numeric AND (net_amount + discount_amount) <= subtotal AND vat_amount <= net_amount AND (is_vat_exempt_at_sale AND vat_rate_at_sale = 0::numeric AND vat_amount = 0::numeric OR NOT is_vat_exempt_at_sale AND vat_rate_at_sale = 12::numeric))",
  },
  {
    table_name: "receipts",
    name: "retail_merchant_snapshot_check",
    definition:
      "CHECK (merchant_name_at_issue IS NULL OR btrim(merchant_name_at_issue::text) <> ''::text)",
  },
] as const;
