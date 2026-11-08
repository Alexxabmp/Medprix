// Frozen definitions from the historical SQL and observed cashier schema.
// Readiness and adoption share these definitions; no connections or DDL here.
export const initialContract = {
  "tables": [
    "accounts_payable",
    "accounts_receivable",
    "ar_payments",
    "backup_records",
    "batch_info",
    "cash_reconciliations",
    "client_contract_items",
    "client_contracts",
    "customers",
    "dashboards",
    "delivery_items",
    "delivery_receipt_items",
    "delivery_receipts",
    "delivery_schedules",
    "discounts",
    "inventory_alerts",
    "permissions",
    "po_items",
    "products",
    "purchase_orders",
    "receipts",
    "reports",
    "role_permissions",
    "roles",
    "stock_movements",
    "supplier_deliveries",
    "supplier_invoices",
    "supplier_payments",
    "suppliers",
    "system_logs",
    "transaction_items",
    "transactions",
    "user_activities",
    "user_roles",
    "users",
    "wholesale_clients",
    "wholesale_order_items",
    "wholesale_orders"
  ],
  "columns": [
    {
      "table_name": "accounts_payable",
      "name": "id",
      "type": "uuid",
      "not_null": true,
      "default_value": "gen_random_uuid()"
    },
    {
      "table_name": "accounts_payable",
      "name": "supplier_id",
      "type": "uuid",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "accounts_payable",
      "name": "invoice_id",
      "type": "uuid",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "accounts_payable",
      "name": "total_owed",
      "type": "numeric(12,2)",
      "not_null": true,
      "default_value": "0.00"
    },
    {
      "table_name": "accounts_payable",
      "name": "total_paid",
      "type": "numeric(12,2)",
      "not_null": true,
      "default_value": "0.00"
    },
    {
      "table_name": "accounts_payable",
      "name": "balance",
      "type": "numeric(12,2)",
      "not_null": true,
      "default_value": "0.00"
    },
    {
      "table_name": "accounts_payable",
      "name": "last_payment_date",
      "type": "date",
      "not_null": false,
      "default_value": null
    },
    {
      "table_name": "accounts_payable",
      "name": "created_at",
      "type": "timestamp with time zone",
      "not_null": true,
      "default_value": "now()"
    },
    {
      "table_name": "accounts_payable",
      "name": "updated_at",
      "type": "timestamp with time zone",
      "not_null": true,
      "default_value": "now()"
    },
    {
      "table_name": "accounts_receivable",
      "name": "id",
      "type": "uuid",
      "not_null": true,
      "default_value": "gen_random_uuid()"
    },
    {
      "table_name": "accounts_receivable",
      "name": "client_id",
      "type": "uuid",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "accounts_receivable",
      "name": "order_id",
      "type": "uuid",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "accounts_receivable",
      "name": "total_owed",
      "type": "numeric(12,2)",
      "not_null": true,
      "default_value": "0.00"
    },
    {
      "table_name": "accounts_receivable",
      "name": "total_paid",
      "type": "numeric(12,2)",
      "not_null": true,
      "default_value": "0.00"
    },
    {
      "table_name": "accounts_receivable",
      "name": "balance",
      "type": "numeric(12,2)",
      "not_null": true,
      "default_value": "0.00"
    },
    {
      "table_name": "accounts_receivable",
      "name": "due_date",
      "type": "date",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "accounts_receivable",
      "name": "created_at",
      "type": "timestamp with time zone",
      "not_null": true,
      "default_value": "now()"
    },
    {
      "table_name": "accounts_receivable",
      "name": "updated_at",
      "type": "timestamp with time zone",
      "not_null": true,
      "default_value": "now()"
    },
    {
      "table_name": "ar_payments",
      "name": "id",
      "type": "uuid",
      "not_null": true,
      "default_value": "gen_random_uuid()"
    },
    {
      "table_name": "ar_payments",
      "name": "ar_id",
      "type": "uuid",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "ar_payments",
      "name": "payment_date",
      "type": "timestamp with time zone",
      "not_null": true,
      "default_value": "now()"
    },
    {
      "table_name": "ar_payments",
      "name": "amount_paid",
      "type": "numeric(12,2)",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "ar_payments",
      "name": "notes",
      "type": "text",
      "not_null": false,
      "default_value": null
    },
    {
      "table_name": "ar_payments",
      "name": "created_at",
      "type": "timestamp with time zone",
      "not_null": true,
      "default_value": "now()"
    },
    {
      "table_name": "backup_records",
      "name": "id",
      "type": "uuid",
      "not_null": true,
      "default_value": "gen_random_uuid()"
    },
    {
      "table_name": "backup_records",
      "name": "initiated_by_user_id",
      "type": "uuid",
      "not_null": false,
      "default_value": null
    },
    {
      "table_name": "backup_records",
      "name": "backup_date",
      "type": "timestamp with time zone",
      "not_null": true,
      "default_value": "now()"
    },
    {
      "table_name": "backup_records",
      "name": "file_path",
      "type": "text",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "backup_records",
      "name": "status",
      "type": "character varying(50)",
      "not_null": true,
      "default_value": "'Completed'::character varying"
    },
    {
      "table_name": "batch_info",
      "name": "id",
      "type": "uuid",
      "not_null": true,
      "default_value": "gen_random_uuid()"
    },
    {
      "table_name": "batch_info",
      "name": "product_id",
      "type": "uuid",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "batch_info",
      "name": "batch_number",
      "type": "character varying(100)",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "batch_info",
      "name": "expiration_date",
      "type": "date",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "batch_info",
      "name": "quantity_remaining",
      "type": "integer",
      "not_null": true,
      "default_value": "0"
    },
    {
      "table_name": "batch_info",
      "name": "mfg_date",
      "type": "date",
      "not_null": false,
      "default_value": null
    },
    {
      "table_name": "batch_info",
      "name": "date_received",
      "type": "date",
      "not_null": false,
      "default_value": null
    },
    {
      "table_name": "batch_info",
      "name": "supplier",
      "type": "character varying(255)",
      "not_null": false,
      "default_value": null
    },
    {
      "table_name": "batch_info",
      "name": "created_at",
      "type": "timestamp with time zone",
      "not_null": true,
      "default_value": "now()"
    },
    {
      "table_name": "batch_info",
      "name": "updated_at",
      "type": "timestamp with time zone",
      "not_null": true,
      "default_value": "now()"
    },
    {
      "table_name": "cash_reconciliations",
      "name": "id",
      "type": "uuid",
      "not_null": true,
      "default_value": "gen_random_uuid()"
    },
    {
      "table_name": "cash_reconciliations",
      "name": "reconciliation_date",
      "type": "date",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "cash_reconciliations",
      "name": "cashier_id",
      "type": "uuid",
      "not_null": false,
      "default_value": null
    },
    {
      "table_name": "cash_reconciliations",
      "name": "cash_on_hand",
      "type": "numeric(12,2)",
      "not_null": true,
      "default_value": "0.00"
    },
    {
      "table_name": "cash_reconciliations",
      "name": "total_reported_sales",
      "type": "numeric(12,2)",
      "not_null": true,
      "default_value": "0.00"
    },
    {
      "table_name": "cash_reconciliations",
      "name": "discrepancy_amount",
      "type": "numeric(12,2)",
      "not_null": true,
      "default_value": "0.00"
    },
    {
      "table_name": "cash_reconciliations",
      "name": "has_flagged_inconsistency",
      "type": "boolean",
      "not_null": true,
      "default_value": "false"
    },
    {
      "table_name": "cash_reconciliations",
      "name": "notes",
      "type": "text",
      "not_null": false,
      "default_value": null
    },
    {
      "table_name": "cash_reconciliations",
      "name": "reconciled_at",
      "type": "timestamp with time zone",
      "not_null": true,
      "default_value": "now()"
    },
    {
      "table_name": "client_contract_items",
      "name": "id",
      "type": "uuid",
      "not_null": true,
      "default_value": "gen_random_uuid()"
    },
    {
      "table_name": "client_contract_items",
      "name": "contract_id",
      "type": "uuid",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "client_contract_items",
      "name": "product_id",
      "type": "uuid",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "client_contract_items",
      "name": "agreed_unit_price",
      "type": "numeric(12,2)",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "client_contracts",
      "name": "id",
      "type": "uuid",
      "not_null": true,
      "default_value": "gen_random_uuid()"
    },
    {
      "table_name": "client_contracts",
      "name": "client_id",
      "type": "uuid",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "client_contracts",
      "name": "effective_date",
      "type": "date",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "client_contracts",
      "name": "expiry_date",
      "type": "date",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "client_contracts",
      "name": "payment_terms",
      "type": "character varying(100)",
      "not_null": false,
      "default_value": null
    },
    {
      "table_name": "client_contracts",
      "name": "status",
      "type": "character varying(50)",
      "not_null": true,
      "default_value": "'Active'::character varying"
    },
    {
      "table_name": "client_contracts",
      "name": "created_at",
      "type": "timestamp with time zone",
      "not_null": true,
      "default_value": "now()"
    },
    {
      "table_name": "client_contracts",
      "name": "updated_at",
      "type": "timestamp with time zone",
      "not_null": true,
      "default_value": "now()"
    },
    {
      "table_name": "customers",
      "name": "id",
      "type": "uuid",
      "not_null": true,
      "default_value": "gen_random_uuid()"
    },
    {
      "table_name": "customers",
      "name": "customer_name",
      "type": "character varying(255)",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "customers",
      "name": "discount_type",
      "type": "character varying(100)",
      "not_null": false,
      "default_value": "'Regular'::character varying"
    },
    {
      "table_name": "customers",
      "name": "id_number",
      "type": "character varying(100)",
      "not_null": false,
      "default_value": null
    },
    {
      "table_name": "customers",
      "name": "contact_number",
      "type": "character varying(50)",
      "not_null": false,
      "default_value": null
    },
    {
      "table_name": "customers",
      "name": "created_at",
      "type": "timestamp with time zone",
      "not_null": true,
      "default_value": "now()"
    },
    {
      "table_name": "customers",
      "name": "updated_at",
      "type": "timestamp with time zone",
      "not_null": true,
      "default_value": "now()"
    },
    {
      "table_name": "dashboards",
      "name": "id",
      "type": "uuid",
      "not_null": true,
      "default_value": "gen_random_uuid()"
    },
    {
      "table_name": "dashboards",
      "name": "user_id",
      "type": "uuid",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "dashboards",
      "name": "config",
      "type": "jsonb",
      "not_null": false,
      "default_value": "'{}'::jsonb"
    },
    {
      "table_name": "dashboards",
      "name": "updated_at",
      "type": "timestamp with time zone",
      "not_null": true,
      "default_value": "now()"
    },
    {
      "table_name": "delivery_items",
      "name": "id",
      "type": "uuid",
      "not_null": true,
      "default_value": "gen_random_uuid()"
    },
    {
      "table_name": "delivery_items",
      "name": "delivery_id",
      "type": "uuid",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "delivery_items",
      "name": "product_id",
      "type": "uuid",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "delivery_items",
      "name": "batch_number",
      "type": "character varying(100)",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "delivery_items",
      "name": "expiration_date",
      "type": "date",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "delivery_items",
      "name": "quantity_delivered",
      "type": "integer",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "delivery_items",
      "name": "created_at",
      "type": "timestamp with time zone",
      "not_null": true,
      "default_value": "now()"
    },
    {
      "table_name": "delivery_receipt_items",
      "name": "id",
      "type": "uuid",
      "not_null": true,
      "default_value": "gen_random_uuid()"
    },
    {
      "table_name": "delivery_receipt_items",
      "name": "receipt_id",
      "type": "uuid",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "delivery_receipt_items",
      "name": "product_id",
      "type": "uuid",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "delivery_receipt_items",
      "name": "batch_number",
      "type": "character varying(100)",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "delivery_receipt_items",
      "name": "expiration_date",
      "type": "date",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "delivery_receipt_items",
      "name": "quantity_delivered",
      "type": "integer",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "delivery_receipts",
      "name": "id",
      "type": "uuid",
      "not_null": true,
      "default_value": "gen_random_uuid()"
    },
    {
      "table_name": "delivery_receipts",
      "name": "order_id",
      "type": "uuid",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "delivery_receipts",
      "name": "delivery_date",
      "type": "timestamp with time zone",
      "not_null": true,
      "default_value": "now()"
    },
    {
      "table_name": "delivery_receipts",
      "name": "receipt_number",
      "type": "character varying(100)",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "delivery_receipts",
      "name": "received_by",
      "type": "character varying(255)",
      "not_null": false,
      "default_value": null
    },
    {
      "table_name": "delivery_receipts",
      "name": "created_at",
      "type": "timestamp with time zone",
      "not_null": true,
      "default_value": "now()"
    },
    {
      "table_name": "delivery_schedules",
      "name": "id",
      "type": "uuid",
      "not_null": true,
      "default_value": "gen_random_uuid()"
    },
    {
      "table_name": "delivery_schedules",
      "name": "order_id",
      "type": "uuid",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "delivery_schedules",
      "name": "scheduled_date",
      "type": "date",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "delivery_schedules",
      "name": "status",
      "type": "delivery_schedule_status_enum",
      "not_null": true,
      "default_value": "'Scheduled'::delivery_schedule_status_enum"
    },
    {
      "table_name": "delivery_schedules",
      "name": "notes",
      "type": "text",
      "not_null": false,
      "default_value": null
    },
    {
      "table_name": "delivery_schedules",
      "name": "created_at",
      "type": "timestamp with time zone",
      "not_null": true,
      "default_value": "now()"
    },
    {
      "table_name": "discounts",
      "name": "id",
      "type": "uuid",
      "not_null": true,
      "default_value": "gen_random_uuid()"
    },
    {
      "table_name": "discounts",
      "name": "transaction_id",
      "type": "uuid",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "discounts",
      "name": "discount_type",
      "type": "character varying(100)",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "discounts",
      "name": "discount_rate",
      "type": "numeric(5,2)",
      "not_null": true,
      "default_value": "0.00"
    },
    {
      "table_name": "discounts",
      "name": "discount_amount",
      "type": "numeric(12,2)",
      "not_null": true,
      "default_value": "0.00"
    },
    {
      "table_name": "discounts",
      "name": "created_at",
      "type": "timestamp with time zone",
      "not_null": true,
      "default_value": "now()"
    },
    {
      "table_name": "inventory_alerts",
      "name": "id",
      "type": "uuid",
      "not_null": true,
      "default_value": "gen_random_uuid()"
    },
    {
      "table_name": "inventory_alerts",
      "name": "product_id",
      "type": "uuid",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "inventory_alerts",
      "name": "batch_id",
      "type": "uuid",
      "not_null": false,
      "default_value": null
    },
    {
      "table_name": "inventory_alerts",
      "name": "alert_type",
      "type": "alert_type_enum",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "inventory_alerts",
      "name": "severity",
      "type": "alert_severity_enum",
      "not_null": true,
      "default_value": "'Medium'::alert_severity_enum"
    },
    {
      "table_name": "inventory_alerts",
      "name": "triggered_at",
      "type": "timestamp with time zone",
      "not_null": true,
      "default_value": "now()"
    },
    {
      "table_name": "inventory_alerts",
      "name": "is_resolved",
      "type": "boolean",
      "not_null": true,
      "default_value": "false"
    },
    {
      "table_name": "inventory_alerts",
      "name": "resolved_at",
      "type": "timestamp with time zone",
      "not_null": false,
      "default_value": null
    },
    {
      "table_name": "permissions",
      "name": "id",
      "type": "uuid",
      "not_null": true,
      "default_value": "gen_random_uuid()"
    },
    {
      "table_name": "permissions",
      "name": "module_name",
      "type": "character varying(100)",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "permissions",
      "name": "permission_type",
      "type": "character varying(100)",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "permissions",
      "name": "created_at",
      "type": "timestamp with time zone",
      "not_null": true,
      "default_value": "now()"
    },
    {
      "table_name": "po_items",
      "name": "id",
      "type": "uuid",
      "not_null": true,
      "default_value": "gen_random_uuid()"
    },
    {
      "table_name": "po_items",
      "name": "po_id",
      "type": "uuid",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "po_items",
      "name": "product_id",
      "type": "uuid",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "po_items",
      "name": "quantity_ordered",
      "type": "integer",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "po_items",
      "name": "unit_cost",
      "type": "numeric(12,2)",
      "not_null": true,
      "default_value": "0.00"
    },
    {
      "table_name": "po_items",
      "name": "line_total",
      "type": "numeric(12,2)",
      "not_null": true,
      "default_value": "0.00"
    },
    {
      "table_name": "po_items",
      "name": "created_at",
      "type": "timestamp with time zone",
      "not_null": true,
      "default_value": "now()"
    },
    {
      "table_name": "products",
      "name": "id",
      "type": "uuid",
      "not_null": true,
      "default_value": "gen_random_uuid()"
    },
    {
      "table_name": "products",
      "name": "sku",
      "type": "character varying(100)",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "products",
      "name": "product_name",
      "type": "character varying(255)",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "products",
      "name": "generic_name",
      "type": "character varying(255)",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "products",
      "name": "category",
      "type": "character varying(100)",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "products",
      "name": "is_dangerous_drug",
      "type": "boolean",
      "not_null": true,
      "default_value": "false"
    },
    {
      "table_name": "products",
      "name": "selling_price",
      "type": "numeric(12,2)",
      "not_null": true,
      "default_value": "0.00"
    },
    {
      "table_name": "products",
      "name": "cost_price",
      "type": "numeric(12,2)",
      "not_null": true,
      "default_value": "0.00"
    },
    {
      "table_name": "products",
      "name": "minimum_stock_level",
      "type": "integer",
      "not_null": true,
      "default_value": "0"
    },
    {
      "table_name": "products",
      "name": "current_stock",
      "type": "integer",
      "not_null": true,
      "default_value": "0"
    },
    {
      "table_name": "products",
      "name": "created_at",
      "type": "timestamp with time zone",
      "not_null": true,
      "default_value": "now()"
    },
    {
      "table_name": "products",
      "name": "updated_at",
      "type": "timestamp with time zone",
      "not_null": true,
      "default_value": "now()"
    },
    {
      "table_name": "purchase_orders",
      "name": "id",
      "type": "uuid",
      "not_null": true,
      "default_value": "gen_random_uuid()"
    },
    {
      "table_name": "purchase_orders",
      "name": "supplier_id",
      "type": "uuid",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "purchase_orders",
      "name": "po_number",
      "type": "character varying(100)",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "purchase_orders",
      "name": "order_date",
      "type": "timestamp with time zone",
      "not_null": true,
      "default_value": "now()"
    },
    {
      "table_name": "purchase_orders",
      "name": "status",
      "type": "po_status_enum",
      "not_null": true,
      "default_value": "'Pending'::po_status_enum"
    },
    {
      "table_name": "purchase_orders",
      "name": "total_order_amount",
      "type": "numeric(12,2)",
      "not_null": true,
      "default_value": "0.00"
    },
    {
      "table_name": "purchase_orders",
      "name": "created_at",
      "type": "timestamp with time zone",
      "not_null": true,
      "default_value": "now()"
    },
    {
      "table_name": "purchase_orders",
      "name": "updated_at",
      "type": "timestamp with time zone",
      "not_null": true,
      "default_value": "now()"
    },
    {
      "table_name": "receipts",
      "name": "id",
      "type": "uuid",
      "not_null": true,
      "default_value": "gen_random_uuid()"
    },
    {
      "table_name": "receipts",
      "name": "transaction_id",
      "type": "uuid",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "receipts",
      "name": "receipt_number",
      "type": "character varying(100)",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "receipts",
      "name": "issued_at",
      "type": "timestamp with time zone",
      "not_null": true,
      "default_value": "now()"
    },
    {
      "table_name": "reports",
      "name": "id",
      "type": "uuid",
      "not_null": true,
      "default_value": "gen_random_uuid()"
    },
    {
      "table_name": "reports",
      "name": "report_type",
      "type": "character varying(100)",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "reports",
      "name": "generated_at",
      "type": "timestamp with time zone",
      "not_null": true,
      "default_value": "now()"
    },
    {
      "table_name": "reports",
      "name": "date_from",
      "type": "date",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "reports",
      "name": "date_to",
      "type": "date",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "reports",
      "name": "generated_by_user_id",
      "type": "uuid",
      "not_null": false,
      "default_value": null
    },
    {
      "table_name": "reports",
      "name": "summary_data",
      "type": "jsonb",
      "not_null": false,
      "default_value": "'{}'::jsonb"
    },
    {
      "table_name": "reports",
      "name": "created_at",
      "type": "timestamp with time zone",
      "not_null": true,
      "default_value": "now()"
    },
    {
      "table_name": "role_permissions",
      "name": "id",
      "type": "uuid",
      "not_null": true,
      "default_value": "gen_random_uuid()"
    },
    {
      "table_name": "role_permissions",
      "name": "role_id",
      "type": "uuid",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "role_permissions",
      "name": "permission_id",
      "type": "uuid",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "role_permissions",
      "name": "granted_at",
      "type": "timestamp with time zone",
      "not_null": true,
      "default_value": "now()"
    },
    {
      "table_name": "roles",
      "name": "id",
      "type": "uuid",
      "not_null": true,
      "default_value": "gen_random_uuid()"
    },
    {
      "table_name": "roles",
      "name": "role_name",
      "type": "character varying(100)",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "roles",
      "name": "description",
      "type": "text",
      "not_null": false,
      "default_value": null
    },
    {
      "table_name": "roles",
      "name": "created_at",
      "type": "timestamp with time zone",
      "not_null": true,
      "default_value": "now()"
    },
    {
      "table_name": "stock_movements",
      "name": "id",
      "type": "uuid",
      "not_null": true,
      "default_value": "gen_random_uuid()"
    },
    {
      "table_name": "stock_movements",
      "name": "product_id",
      "type": "uuid",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "stock_movements",
      "name": "batch_id",
      "type": "uuid",
      "not_null": false,
      "default_value": null
    },
    {
      "table_name": "stock_movements",
      "name": "movement_type",
      "type": "stock_movement_type_enum",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "stock_movements",
      "name": "quantity",
      "type": "integer",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "stock_movements",
      "name": "movement_date",
      "type": "timestamp with time zone",
      "not_null": true,
      "default_value": "now()"
    },
    {
      "table_name": "stock_movements",
      "name": "reference_id",
      "type": "uuid",
      "not_null": false,
      "default_value": null
    },
    {
      "table_name": "stock_movements",
      "name": "notes",
      "type": "text",
      "not_null": false,
      "default_value": null
    },
    {
      "table_name": "supplier_deliveries",
      "name": "id",
      "type": "uuid",
      "not_null": true,
      "default_value": "gen_random_uuid()"
    },
    {
      "table_name": "supplier_deliveries",
      "name": "po_id",
      "type": "uuid",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "supplier_deliveries",
      "name": "delivery_date",
      "type": "timestamp with time zone",
      "not_null": true,
      "default_value": "now()"
    },
    {
      "table_name": "supplier_deliveries",
      "name": "delivery_status",
      "type": "delivery_status_enum",
      "not_null": true,
      "default_value": "'Received'::delivery_status_enum"
    },
    {
      "table_name": "supplier_deliveries",
      "name": "created_at",
      "type": "timestamp with time zone",
      "not_null": true,
      "default_value": "now()"
    },
    {
      "table_name": "supplier_invoices",
      "name": "id",
      "type": "uuid",
      "not_null": true,
      "default_value": "gen_random_uuid()"
    },
    {
      "table_name": "supplier_invoices",
      "name": "po_id",
      "type": "uuid",
      "not_null": false,
      "default_value": null
    },
    {
      "table_name": "supplier_invoices",
      "name": "supplier_id",
      "type": "uuid",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "supplier_invoices",
      "name": "invoice_number",
      "type": "character varying(100)",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "supplier_invoices",
      "name": "due_date",
      "type": "date",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "supplier_invoices",
      "name": "invoice_amount",
      "type": "numeric(12,2)",
      "not_null": true,
      "default_value": "0.00"
    },
    {
      "table_name": "supplier_invoices",
      "name": "is_paid",
      "type": "boolean",
      "not_null": true,
      "default_value": "false"
    },
    {
      "table_name": "supplier_invoices",
      "name": "created_at",
      "type": "timestamp with time zone",
      "not_null": true,
      "default_value": "now()"
    },
    {
      "table_name": "supplier_payments",
      "name": "id",
      "type": "uuid",
      "not_null": true,
      "default_value": "gen_random_uuid()"
    },
    {
      "table_name": "supplier_payments",
      "name": "ap_id",
      "type": "uuid",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "supplier_payments",
      "name": "payment_date",
      "type": "timestamp with time zone",
      "not_null": true,
      "default_value": "now()"
    },
    {
      "table_name": "supplier_payments",
      "name": "amount_paid",
      "type": "numeric(12,2)",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "supplier_payments",
      "name": "notes",
      "type": "text",
      "not_null": false,
      "default_value": null
    },
    {
      "table_name": "supplier_payments",
      "name": "created_at",
      "type": "timestamp with time zone",
      "not_null": true,
      "default_value": "now()"
    },
    {
      "table_name": "suppliers",
      "name": "id",
      "type": "uuid",
      "not_null": true,
      "default_value": "gen_random_uuid()"
    },
    {
      "table_name": "suppliers",
      "name": "supplier_name",
      "type": "character varying(255)",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "suppliers",
      "name": "contact_person",
      "type": "character varying(255)",
      "not_null": false,
      "default_value": null
    },
    {
      "table_name": "suppliers",
      "name": "contact_number",
      "type": "character varying(50)",
      "not_null": false,
      "default_value": null
    },
    {
      "table_name": "suppliers",
      "name": "email",
      "type": "character varying(255)",
      "not_null": false,
      "default_value": null
    },
    {
      "table_name": "suppliers",
      "name": "address",
      "type": "text",
      "not_null": false,
      "default_value": null
    },
    {
      "table_name": "suppliers",
      "name": "payment_terms",
      "type": "character varying(100)",
      "not_null": false,
      "default_value": null
    },
    {
      "table_name": "suppliers",
      "name": "created_at",
      "type": "timestamp with time zone",
      "not_null": true,
      "default_value": "now()"
    },
    {
      "table_name": "suppliers",
      "name": "updated_at",
      "type": "timestamp with time zone",
      "not_null": true,
      "default_value": "now()"
    },
    {
      "table_name": "system_logs",
      "name": "id",
      "type": "uuid",
      "not_null": true,
      "default_value": "gen_random_uuid()"
    },
    {
      "table_name": "system_logs",
      "name": "user_id",
      "type": "uuid",
      "not_null": false,
      "default_value": null
    },
    {
      "table_name": "system_logs",
      "name": "action_type",
      "type": "character varying(100)",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "system_logs",
      "name": "module",
      "type": "character varying(100)",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "system_logs",
      "name": "description",
      "type": "text",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "system_logs",
      "name": "status",
      "type": "log_status_enum",
      "not_null": true,
      "default_value": "'Success'::log_status_enum"
    },
    {
      "table_name": "system_logs",
      "name": "device_ip",
      "type": "character varying(50)",
      "not_null": false,
      "default_value": null
    },
    {
      "table_name": "system_logs",
      "name": "timestamp",
      "type": "timestamp with time zone",
      "not_null": true,
      "default_value": "now()"
    },
    {
      "table_name": "transaction_items",
      "name": "id",
      "type": "uuid",
      "not_null": true,
      "default_value": "gen_random_uuid()"
    },
    {
      "table_name": "transaction_items",
      "name": "transaction_id",
      "type": "uuid",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "transaction_items",
      "name": "product_id",
      "type": "uuid",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "transaction_items",
      "name": "batch_id",
      "type": "uuid",
      "not_null": false,
      "default_value": null
    },
    {
      "table_name": "transaction_items",
      "name": "quantity",
      "type": "integer",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "transaction_items",
      "name": "unit_price_at_sale",
      "type": "numeric(12,2)",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "transaction_items",
      "name": "subtotal",
      "type": "numeric(12,2)",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "transaction_items",
      "name": "created_at",
      "type": "timestamp with time zone",
      "not_null": true,
      "default_value": "now()"
    },
    {
      "table_name": "transactions",
      "name": "id",
      "type": "uuid",
      "not_null": true,
      "default_value": "gen_random_uuid()"
    },
    {
      "table_name": "transactions",
      "name": "cashier_id",
      "type": "uuid",
      "not_null": false,
      "default_value": null
    },
    {
      "table_name": "transactions",
      "name": "customer_id",
      "type": "uuid",
      "not_null": false,
      "default_value": null
    },
    {
      "table_name": "transactions",
      "name": "transaction_date",
      "type": "timestamp with time zone",
      "not_null": true,
      "default_value": "now()"
    },
    {
      "table_name": "transactions",
      "name": "status",
      "type": "transaction_status_enum",
      "not_null": true,
      "default_value": "'Completed'::transaction_status_enum"
    },
    {
      "table_name": "transactions",
      "name": "gross_amount",
      "type": "numeric(12,2)",
      "not_null": true,
      "default_value": "0.00"
    },
    {
      "table_name": "transactions",
      "name": "total_discount",
      "type": "numeric(12,2)",
      "not_null": true,
      "default_value": "0.00"
    },
    {
      "table_name": "transactions",
      "name": "vat_amount",
      "type": "numeric(12,2)",
      "not_null": true,
      "default_value": "0.00"
    },
    {
      "table_name": "transactions",
      "name": "net_amount",
      "type": "numeric(12,2)",
      "not_null": true,
      "default_value": "0.00"
    },
    {
      "table_name": "transactions",
      "name": "amount_tendered",
      "type": "numeric(12,2)",
      "not_null": true,
      "default_value": "0.00"
    },
    {
      "table_name": "transactions",
      "name": "change_amount",
      "type": "numeric(12,2)",
      "not_null": true,
      "default_value": "0.00"
    },
    {
      "table_name": "transactions",
      "name": "payment_method",
      "type": "character varying(50)",
      "not_null": true,
      "default_value": "'Cash'::character varying"
    },
    {
      "table_name": "transactions",
      "name": "void_reason",
      "type": "text",
      "not_null": false,
      "default_value": null
    },
    {
      "table_name": "transactions",
      "name": "created_at",
      "type": "timestamp with time zone",
      "not_null": true,
      "default_value": "now()"
    },
    {
      "table_name": "transactions",
      "name": "updated_at",
      "type": "timestamp with time zone",
      "not_null": true,
      "default_value": "now()"
    },
    {
      "table_name": "user_activities",
      "name": "id",
      "type": "uuid",
      "not_null": true,
      "default_value": "gen_random_uuid()"
    },
    {
      "table_name": "user_activities",
      "name": "user_id",
      "type": "uuid",
      "not_null": false,
      "default_value": null
    },
    {
      "table_name": "user_activities",
      "name": "activity",
      "type": "character varying(255)",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "user_activities",
      "name": "module",
      "type": "character varying(100)",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "user_activities",
      "name": "description",
      "type": "text",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "user_activities",
      "name": "flag",
      "type": "activity_flag_enum",
      "not_null": true,
      "default_value": "'Normal'::activity_flag_enum"
    },
    {
      "table_name": "user_activities",
      "name": "timestamp",
      "type": "timestamp with time zone",
      "not_null": true,
      "default_value": "now()"
    },
    {
      "table_name": "user_roles",
      "name": "id",
      "type": "uuid",
      "not_null": true,
      "default_value": "gen_random_uuid()"
    },
    {
      "table_name": "user_roles",
      "name": "user_id",
      "type": "uuid",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "user_roles",
      "name": "role_id",
      "type": "uuid",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "user_roles",
      "name": "assigned_at",
      "type": "timestamp with time zone",
      "not_null": true,
      "default_value": "now()"
    },
    {
      "table_name": "users",
      "name": "id",
      "type": "uuid",
      "not_null": true,
      "default_value": "gen_random_uuid()"
    },
    {
      "table_name": "users",
      "name": "username",
      "type": "character varying(100)",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "users",
      "name": "password_hash",
      "type": "character varying(255)",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "users",
      "name": "full_name",
      "type": "character varying(255)",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "users",
      "name": "contact_number",
      "type": "character varying(13)",
      "not_null": false,
      "default_value": null
    },
    {
      "table_name": "users",
      "name": "employee_code",
      "type": "character varying(50)",
      "not_null": false,
      "default_value": null
    },
    {
      "table_name": "users",
      "name": "role",
      "type": "user_role_enum",
      "not_null": true,
      "default_value": "'Cashier'::user_role_enum"
    },
    {
      "table_name": "users",
      "name": "is_active",
      "type": "boolean",
      "not_null": true,
      "default_value": "true"
    },
    {
      "table_name": "users",
      "name": "created_at",
      "type": "timestamp with time zone",
      "not_null": true,
      "default_value": "now()"
    },
    {
      "table_name": "users",
      "name": "last_login",
      "type": "timestamp with time zone",
      "not_null": false,
      "default_value": null
    },
    {
      "table_name": "users",
      "name": "updated_at",
      "type": "timestamp with time zone",
      "not_null": true,
      "default_value": "now()"
    },
    {
      "table_name": "wholesale_clients",
      "name": "id",
      "type": "uuid",
      "not_null": true,
      "default_value": "gen_random_uuid()"
    },
    {
      "table_name": "wholesale_clients",
      "name": "client_name",
      "type": "character varying(255)",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "wholesale_clients",
      "name": "contact_person",
      "type": "character varying(255)",
      "not_null": false,
      "default_value": null
    },
    {
      "table_name": "wholesale_clients",
      "name": "contact_number",
      "type": "character varying(50)",
      "not_null": false,
      "default_value": null
    },
    {
      "table_name": "wholesale_clients",
      "name": "email",
      "type": "character varying(255)",
      "not_null": false,
      "default_value": null
    },
    {
      "table_name": "wholesale_clients",
      "name": "address",
      "type": "text",
      "not_null": false,
      "default_value": null
    },
    {
      "table_name": "wholesale_clients",
      "name": "created_at",
      "type": "timestamp with time zone",
      "not_null": true,
      "default_value": "now()"
    },
    {
      "table_name": "wholesale_clients",
      "name": "updated_at",
      "type": "timestamp with time zone",
      "not_null": true,
      "default_value": "now()"
    },
    {
      "table_name": "wholesale_order_items",
      "name": "id",
      "type": "uuid",
      "not_null": true,
      "default_value": "gen_random_uuid()"
    },
    {
      "table_name": "wholesale_order_items",
      "name": "order_id",
      "type": "uuid",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "wholesale_order_items",
      "name": "product_id",
      "type": "uuid",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "wholesale_order_items",
      "name": "quantity",
      "type": "integer",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "wholesale_order_items",
      "name": "unit_price",
      "type": "numeric(12,2)",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "wholesale_order_items",
      "name": "line_total",
      "type": "numeric(12,2)",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "wholesale_orders",
      "name": "id",
      "type": "uuid",
      "not_null": true,
      "default_value": "gen_random_uuid()"
    },
    {
      "table_name": "wholesale_orders",
      "name": "client_id",
      "type": "uuid",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "wholesale_orders",
      "name": "contract_id",
      "type": "uuid",
      "not_null": false,
      "default_value": null
    },
    {
      "table_name": "wholesale_orders",
      "name": "order_date",
      "type": "timestamp with time zone",
      "not_null": true,
      "default_value": "now()"
    },
    {
      "table_name": "wholesale_orders",
      "name": "status",
      "type": "wholesale_order_status_enum",
      "not_null": true,
      "default_value": "'Pending'::wholesale_order_status_enum"
    },
    {
      "table_name": "wholesale_orders",
      "name": "total_order_amount",
      "type": "numeric(12,2)",
      "not_null": true,
      "default_value": "0.00"
    },
    {
      "table_name": "wholesale_orders",
      "name": "created_at",
      "type": "timestamp with time zone",
      "not_null": true,
      "default_value": "now()"
    },
    {
      "table_name": "wholesale_orders",
      "name": "updated_at",
      "type": "timestamp with time zone",
      "not_null": true,
      "default_value": "now()"
    }
  ],
  "constraints": [
    {
      "table_name": "accounts_payable",
      "name": "accounts_payable_balance_check",
      "type": "c",
      "definition": "CHECK (balance >= 0::numeric)",
      "validated": true
    },
    {
      "table_name": "accounts_payable",
      "name": "accounts_payable_invoice_id_key",
      "type": "u",
      "definition": "UNIQUE (invoice_id)",
      "validated": true
    },
    {
      "table_name": "accounts_payable",
      "name": "accounts_payable_invoice_id_supplier_invoices_id_fk",
      "type": "f",
      "definition": "FOREIGN KEY (invoice_id) REFERENCES supplier_invoices(id) ON DELETE CASCADE",
      "validated": true
    },
    {
      "table_name": "accounts_payable",
      "name": "accounts_payable_pkey",
      "type": "p",
      "definition": "PRIMARY KEY (id)",
      "validated": true
    },
    {
      "table_name": "accounts_payable",
      "name": "accounts_payable_supplier_id_suppliers_id_fk",
      "type": "f",
      "definition": "FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE RESTRICT",
      "validated": true
    },
    {
      "table_name": "accounts_payable",
      "name": "accounts_payable_total_owed_check",
      "type": "c",
      "definition": "CHECK (total_owed >= 0::numeric)",
      "validated": true
    },
    {
      "table_name": "accounts_payable",
      "name": "accounts_payable_total_paid_check",
      "type": "c",
      "definition": "CHECK (total_paid >= 0::numeric)",
      "validated": true
    },
    {
      "table_name": "accounts_receivable",
      "name": "accounts_receivable_balance_check",
      "type": "c",
      "definition": "CHECK (balance >= 0::numeric)",
      "validated": true
    },
    {
      "table_name": "accounts_receivable",
      "name": "accounts_receivable_client_id_wholesale_clients_id_fk",
      "type": "f",
      "definition": "FOREIGN KEY (client_id) REFERENCES wholesale_clients(id) ON DELETE RESTRICT",
      "validated": true
    },
    {
      "table_name": "accounts_receivable",
      "name": "accounts_receivable_order_id_key",
      "type": "u",
      "definition": "UNIQUE (order_id)",
      "validated": true
    },
    {
      "table_name": "accounts_receivable",
      "name": "accounts_receivable_order_id_wholesale_orders_id_fk",
      "type": "f",
      "definition": "FOREIGN KEY (order_id) REFERENCES wholesale_orders(id) ON DELETE CASCADE",
      "validated": true
    },
    {
      "table_name": "accounts_receivable",
      "name": "accounts_receivable_pkey",
      "type": "p",
      "definition": "PRIMARY KEY (id)",
      "validated": true
    },
    {
      "table_name": "accounts_receivable",
      "name": "accounts_receivable_total_owed_check",
      "type": "c",
      "definition": "CHECK (total_owed >= 0::numeric)",
      "validated": true
    },
    {
      "table_name": "accounts_receivable",
      "name": "accounts_receivable_total_paid_check",
      "type": "c",
      "definition": "CHECK (total_paid >= 0::numeric)",
      "validated": true
    },
    {
      "table_name": "ar_payments",
      "name": "ar_payments_amount_paid_check",
      "type": "c",
      "definition": "CHECK (amount_paid > 0::numeric)",
      "validated": true
    },
    {
      "table_name": "ar_payments",
      "name": "ar_payments_ar_id_accounts_receivable_id_fk",
      "type": "f",
      "definition": "FOREIGN KEY (ar_id) REFERENCES accounts_receivable(id) ON DELETE CASCADE",
      "validated": true
    },
    {
      "table_name": "ar_payments",
      "name": "ar_payments_pkey",
      "type": "p",
      "definition": "PRIMARY KEY (id)",
      "validated": true
    },
    {
      "table_name": "backup_records",
      "name": "backup_records_initiated_by_user_id_users_id_fk",
      "type": "f",
      "definition": "FOREIGN KEY (initiated_by_user_id) REFERENCES users(id) ON DELETE SET NULL",
      "validated": true
    },
    {
      "table_name": "backup_records",
      "name": "backup_records_pkey",
      "type": "p",
      "definition": "PRIMARY KEY (id)",
      "validated": true
    },
    {
      "table_name": "batch_info",
      "name": "batch_info_pkey",
      "type": "p",
      "definition": "PRIMARY KEY (id)",
      "validated": true
    },
    {
      "table_name": "batch_info",
      "name": "batch_info_product_id_products_id_fk",
      "type": "f",
      "definition": "FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE",
      "validated": true
    },
    {
      "table_name": "batch_info",
      "name": "batch_info_quantity_remaining_check",
      "type": "c",
      "definition": "CHECK (quantity_remaining >= 0)",
      "validated": true
    },
    {
      "table_name": "batch_info",
      "name": "uq_product_batch",
      "type": "u",
      "definition": "UNIQUE (product_id, batch_number)",
      "validated": true
    },
    {
      "table_name": "cash_reconciliations",
      "name": "cash_reconciliations_cashier_id_users_id_fk",
      "type": "f",
      "definition": "FOREIGN KEY (cashier_id) REFERENCES users(id) ON DELETE SET NULL",
      "validated": true
    },
    {
      "table_name": "cash_reconciliations",
      "name": "cash_reconciliations_pkey",
      "type": "p",
      "definition": "PRIMARY KEY (id)",
      "validated": true
    },
    {
      "table_name": "client_contract_items",
      "name": "client_contract_items_agreed_unit_price_check",
      "type": "c",
      "definition": "CHECK (agreed_unit_price >= 0::numeric)",
      "validated": true
    },
    {
      "table_name": "client_contract_items",
      "name": "client_contract_items_contract_id_client_contracts_id_fk",
      "type": "f",
      "definition": "FOREIGN KEY (contract_id) REFERENCES client_contracts(id) ON DELETE CASCADE",
      "validated": true
    },
    {
      "table_name": "client_contract_items",
      "name": "client_contract_items_pkey",
      "type": "p",
      "definition": "PRIMARY KEY (id)",
      "validated": true
    },
    {
      "table_name": "client_contract_items",
      "name": "client_contract_items_product_id_products_id_fk",
      "type": "f",
      "definition": "FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT",
      "validated": true
    },
    {
      "table_name": "client_contract_items",
      "name": "uq_contract_product",
      "type": "u",
      "definition": "UNIQUE (contract_id, product_id)",
      "validated": true
    },
    {
      "table_name": "client_contracts",
      "name": "client_contracts_client_id_wholesale_clients_id_fk",
      "type": "f",
      "definition": "FOREIGN KEY (client_id) REFERENCES wholesale_clients(id) ON DELETE CASCADE",
      "validated": true
    },
    {
      "table_name": "client_contracts",
      "name": "client_contracts_pkey",
      "type": "p",
      "definition": "PRIMARY KEY (id)",
      "validated": true
    },
    {
      "table_name": "customers",
      "name": "customers_pkey",
      "type": "p",
      "definition": "PRIMARY KEY (id)",
      "validated": true
    },
    {
      "table_name": "dashboards",
      "name": "dashboards_pkey",
      "type": "p",
      "definition": "PRIMARY KEY (id)",
      "validated": true
    },
    {
      "table_name": "dashboards",
      "name": "dashboards_user_id_key",
      "type": "u",
      "definition": "UNIQUE (user_id)",
      "validated": true
    },
    {
      "table_name": "dashboards",
      "name": "dashboards_user_id_users_id_fk",
      "type": "f",
      "definition": "FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE",
      "validated": true
    },
    {
      "table_name": "delivery_items",
      "name": "delivery_items_delivery_id_supplier_deliveries_id_fk",
      "type": "f",
      "definition": "FOREIGN KEY (delivery_id) REFERENCES supplier_deliveries(id) ON DELETE CASCADE",
      "validated": true
    },
    {
      "table_name": "delivery_items",
      "name": "delivery_items_pkey",
      "type": "p",
      "definition": "PRIMARY KEY (id)",
      "validated": true
    },
    {
      "table_name": "delivery_items",
      "name": "delivery_items_product_id_products_id_fk",
      "type": "f",
      "definition": "FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT",
      "validated": true
    },
    {
      "table_name": "delivery_items",
      "name": "delivery_items_quantity_delivered_check",
      "type": "c",
      "definition": "CHECK (quantity_delivered > 0)",
      "validated": true
    },
    {
      "table_name": "delivery_receipt_items",
      "name": "delivery_receipt_items_pkey",
      "type": "p",
      "definition": "PRIMARY KEY (id)",
      "validated": true
    },
    {
      "table_name": "delivery_receipt_items",
      "name": "delivery_receipt_items_product_id_products_id_fk",
      "type": "f",
      "definition": "FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT",
      "validated": true
    },
    {
      "table_name": "delivery_receipt_items",
      "name": "delivery_receipt_items_quantity_delivered_check",
      "type": "c",
      "definition": "CHECK (quantity_delivered > 0)",
      "validated": true
    },
    {
      "table_name": "delivery_receipt_items",
      "name": "delivery_receipt_items_receipt_id_delivery_receipts_id_fk",
      "type": "f",
      "definition": "FOREIGN KEY (receipt_id) REFERENCES delivery_receipts(id) ON DELETE CASCADE",
      "validated": true
    },
    {
      "table_name": "delivery_receipts",
      "name": "delivery_receipts_order_id_wholesale_orders_id_fk",
      "type": "f",
      "definition": "FOREIGN KEY (order_id) REFERENCES wholesale_orders(id) ON DELETE RESTRICT",
      "validated": true
    },
    {
      "table_name": "delivery_receipts",
      "name": "delivery_receipts_pkey",
      "type": "p",
      "definition": "PRIMARY KEY (id)",
      "validated": true
    },
    {
      "table_name": "delivery_receipts",
      "name": "delivery_receipts_receipt_number_key",
      "type": "u",
      "definition": "UNIQUE (receipt_number)",
      "validated": true
    },
    {
      "table_name": "delivery_schedules",
      "name": "delivery_schedules_order_id_wholesale_orders_id_fk",
      "type": "f",
      "definition": "FOREIGN KEY (order_id) REFERENCES wholesale_orders(id) ON DELETE CASCADE",
      "validated": true
    },
    {
      "table_name": "delivery_schedules",
      "name": "delivery_schedules_pkey",
      "type": "p",
      "definition": "PRIMARY KEY (id)",
      "validated": true
    },
    {
      "table_name": "discounts",
      "name": "discounts_discount_amount_check",
      "type": "c",
      "definition": "CHECK (discount_amount >= 0::numeric)",
      "validated": true
    },
    {
      "table_name": "discounts",
      "name": "discounts_discount_rate_check",
      "type": "c",
      "definition": "CHECK (discount_rate >= 0::numeric)",
      "validated": true
    },
    {
      "table_name": "discounts",
      "name": "discounts_pkey",
      "type": "p",
      "definition": "PRIMARY KEY (id)",
      "validated": true
    },
    {
      "table_name": "discounts",
      "name": "discounts_transaction_id_transactions_id_fk",
      "type": "f",
      "definition": "FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE",
      "validated": true
    },
    {
      "table_name": "inventory_alerts",
      "name": "inventory_alerts_batch_id_batch_info_id_fk",
      "type": "f",
      "definition": "FOREIGN KEY (batch_id) REFERENCES batch_info(id) ON DELETE SET NULL",
      "validated": true
    },
    {
      "table_name": "inventory_alerts",
      "name": "inventory_alerts_pkey",
      "type": "p",
      "definition": "PRIMARY KEY (id)",
      "validated": true
    },
    {
      "table_name": "inventory_alerts",
      "name": "inventory_alerts_product_id_products_id_fk",
      "type": "f",
      "definition": "FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE",
      "validated": true
    },
    {
      "table_name": "permissions",
      "name": "permissions_pkey",
      "type": "p",
      "definition": "PRIMARY KEY (id)",
      "validated": true
    },
    {
      "table_name": "permissions",
      "name": "uq_permissions_module_type",
      "type": "u",
      "definition": "UNIQUE (module_name, permission_type)",
      "validated": true
    },
    {
      "table_name": "po_items",
      "name": "po_items_line_total_check",
      "type": "c",
      "definition": "CHECK (line_total >= 0::numeric)",
      "validated": true
    },
    {
      "table_name": "po_items",
      "name": "po_items_pkey",
      "type": "p",
      "definition": "PRIMARY KEY (id)",
      "validated": true
    },
    {
      "table_name": "po_items",
      "name": "po_items_po_id_purchase_orders_id_fk",
      "type": "f",
      "definition": "FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE CASCADE",
      "validated": true
    },
    {
      "table_name": "po_items",
      "name": "po_items_product_id_products_id_fk",
      "type": "f",
      "definition": "FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT",
      "validated": true
    },
    {
      "table_name": "po_items",
      "name": "po_items_quantity_ordered_check",
      "type": "c",
      "definition": "CHECK (quantity_ordered > 0)",
      "validated": true
    },
    {
      "table_name": "po_items",
      "name": "po_items_unit_cost_check",
      "type": "c",
      "definition": "CHECK (unit_cost >= 0::numeric)",
      "validated": true
    },
    {
      "table_name": "products",
      "name": "products_cost_price_check",
      "type": "c",
      "definition": "CHECK (cost_price >= 0::numeric)",
      "validated": true
    },
    {
      "table_name": "products",
      "name": "products_minimum_stock_level_check",
      "type": "c",
      "definition": "CHECK (minimum_stock_level >= 0)",
      "validated": true
    },
    {
      "table_name": "products",
      "name": "products_pkey",
      "type": "p",
      "definition": "PRIMARY KEY (id)",
      "validated": true
    },
    {
      "table_name": "products",
      "name": "products_selling_price_check",
      "type": "c",
      "definition": "CHECK (selling_price >= 0::numeric)",
      "validated": true
    },
    {
      "table_name": "products",
      "name": "uq_products_sku",
      "type": "u",
      "definition": "UNIQUE (sku)",
      "validated": true
    },
    {
      "table_name": "purchase_orders",
      "name": "purchase_orders_pkey",
      "type": "p",
      "definition": "PRIMARY KEY (id)",
      "validated": true
    },
    {
      "table_name": "purchase_orders",
      "name": "purchase_orders_po_number_key",
      "type": "u",
      "definition": "UNIQUE (po_number)",
      "validated": true
    },
    {
      "table_name": "purchase_orders",
      "name": "purchase_orders_supplier_id_suppliers_id_fk",
      "type": "f",
      "definition": "FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE RESTRICT",
      "validated": true
    },
    {
      "table_name": "purchase_orders",
      "name": "purchase_orders_total_order_amount_check",
      "type": "c",
      "definition": "CHECK (total_order_amount >= 0::numeric)",
      "validated": true
    },
    {
      "table_name": "receipts",
      "name": "receipts_pkey",
      "type": "p",
      "definition": "PRIMARY KEY (id)",
      "validated": true
    },
    {
      "table_name": "receipts",
      "name": "receipts_receipt_number_key",
      "type": "u",
      "definition": "UNIQUE (receipt_number)",
      "validated": true
    },
    {
      "table_name": "receipts",
      "name": "receipts_transaction_id_key",
      "type": "u",
      "definition": "UNIQUE (transaction_id)",
      "validated": true
    },
    {
      "table_name": "receipts",
      "name": "receipts_transaction_id_transactions_id_fk",
      "type": "f",
      "definition": "FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE",
      "validated": true
    },
    {
      "table_name": "reports",
      "name": "reports_generated_by_user_id_users_id_fk",
      "type": "f",
      "definition": "FOREIGN KEY (generated_by_user_id) REFERENCES users(id) ON DELETE SET NULL",
      "validated": true
    },
    {
      "table_name": "reports",
      "name": "reports_pkey",
      "type": "p",
      "definition": "PRIMARY KEY (id)",
      "validated": true
    },
    {
      "table_name": "role_permissions",
      "name": "role_permissions_permission_id_permissions_id_fk",
      "type": "f",
      "definition": "FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE",
      "validated": true
    },
    {
      "table_name": "role_permissions",
      "name": "role_permissions_pkey",
      "type": "p",
      "definition": "PRIMARY KEY (id)",
      "validated": true
    },
    {
      "table_name": "role_permissions",
      "name": "role_permissions_role_id_roles_id_fk",
      "type": "f",
      "definition": "FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE",
      "validated": true
    },
    {
      "table_name": "role_permissions",
      "name": "uq_role_permissions",
      "type": "u",
      "definition": "UNIQUE (role_id, permission_id)",
      "validated": true
    },
    {
      "table_name": "roles",
      "name": "roles_pkey",
      "type": "p",
      "definition": "PRIMARY KEY (id)",
      "validated": true
    },
    {
      "table_name": "roles",
      "name": "roles_role_name_key",
      "type": "u",
      "definition": "UNIQUE (role_name)",
      "validated": true
    },
    {
      "table_name": "stock_movements",
      "name": "stock_movements_batch_id_batch_info_id_fk",
      "type": "f",
      "definition": "FOREIGN KEY (batch_id) REFERENCES batch_info(id) ON DELETE SET NULL",
      "validated": true
    },
    {
      "table_name": "stock_movements",
      "name": "stock_movements_pkey",
      "type": "p",
      "definition": "PRIMARY KEY (id)",
      "validated": true
    },
    {
      "table_name": "stock_movements",
      "name": "stock_movements_product_id_products_id_fk",
      "type": "f",
      "definition": "FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE",
      "validated": true
    },
    {
      "table_name": "supplier_deliveries",
      "name": "supplier_deliveries_pkey",
      "type": "p",
      "definition": "PRIMARY KEY (id)",
      "validated": true
    },
    {
      "table_name": "supplier_deliveries",
      "name": "supplier_deliveries_po_id_purchase_orders_id_fk",
      "type": "f",
      "definition": "FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE RESTRICT",
      "validated": true
    },
    {
      "table_name": "supplier_invoices",
      "name": "supplier_invoices_invoice_amount_check",
      "type": "c",
      "definition": "CHECK (invoice_amount >= 0::numeric)",
      "validated": true
    },
    {
      "table_name": "supplier_invoices",
      "name": "supplier_invoices_invoice_number_key",
      "type": "u",
      "definition": "UNIQUE (invoice_number)",
      "validated": true
    },
    {
      "table_name": "supplier_invoices",
      "name": "supplier_invoices_pkey",
      "type": "p",
      "definition": "PRIMARY KEY (id)",
      "validated": true
    },
    {
      "table_name": "supplier_invoices",
      "name": "supplier_invoices_po_id_purchase_orders_id_fk",
      "type": "f",
      "definition": "FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE SET NULL",
      "validated": true
    },
    {
      "table_name": "supplier_invoices",
      "name": "supplier_invoices_supplier_id_suppliers_id_fk",
      "type": "f",
      "definition": "FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE RESTRICT",
      "validated": true
    },
    {
      "table_name": "supplier_payments",
      "name": "supplier_payments_amount_paid_check",
      "type": "c",
      "definition": "CHECK (amount_paid > 0::numeric)",
      "validated": true
    },
    {
      "table_name": "supplier_payments",
      "name": "supplier_payments_ap_id_accounts_payable_id_fk",
      "type": "f",
      "definition": "FOREIGN KEY (ap_id) REFERENCES accounts_payable(id) ON DELETE CASCADE",
      "validated": true
    },
    {
      "table_name": "supplier_payments",
      "name": "supplier_payments_pkey",
      "type": "p",
      "definition": "PRIMARY KEY (id)",
      "validated": true
    },
    {
      "table_name": "suppliers",
      "name": "suppliers_pkey",
      "type": "p",
      "definition": "PRIMARY KEY (id)",
      "validated": true
    },
    {
      "table_name": "system_logs",
      "name": "system_logs_pkey",
      "type": "p",
      "definition": "PRIMARY KEY (id)",
      "validated": true
    },
    {
      "table_name": "system_logs",
      "name": "system_logs_user_id_users_id_fk",
      "type": "f",
      "definition": "FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL",
      "validated": true
    },
    {
      "table_name": "transaction_items",
      "name": "transaction_items_batch_id_batch_info_id_fk",
      "type": "f",
      "definition": "FOREIGN KEY (batch_id) REFERENCES batch_info(id) ON DELETE SET NULL",
      "validated": true
    },
    {
      "table_name": "transaction_items",
      "name": "transaction_items_pkey",
      "type": "p",
      "definition": "PRIMARY KEY (id)",
      "validated": true
    },
    {
      "table_name": "transaction_items",
      "name": "transaction_items_product_id_products_id_fk",
      "type": "f",
      "definition": "FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT",
      "validated": true
    },
    {
      "table_name": "transaction_items",
      "name": "transaction_items_quantity_check",
      "type": "c",
      "definition": "CHECK (quantity > 0)",
      "validated": true
    },
    {
      "table_name": "transaction_items",
      "name": "transaction_items_subtotal_check",
      "type": "c",
      "definition": "CHECK (subtotal >= 0::numeric)",
      "validated": true
    },
    {
      "table_name": "transaction_items",
      "name": "transaction_items_transaction_id_transactions_id_fk",
      "type": "f",
      "definition": "FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE",
      "validated": true
    },
    {
      "table_name": "transaction_items",
      "name": "transaction_items_unit_price_at_sale_check",
      "type": "c",
      "definition": "CHECK (unit_price_at_sale >= 0::numeric)",
      "validated": true
    },
    {
      "table_name": "transactions",
      "name": "transactions_cashier_id_users_id_fk",
      "type": "f",
      "definition": "FOREIGN KEY (cashier_id) REFERENCES users(id) ON DELETE SET NULL",
      "validated": true
    },
    {
      "table_name": "transactions",
      "name": "transactions_customer_id_customers_id_fk",
      "type": "f",
      "definition": "FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL",
      "validated": true
    },
    {
      "table_name": "transactions",
      "name": "transactions_pkey",
      "type": "p",
      "definition": "PRIMARY KEY (id)",
      "validated": true
    },
    {
      "table_name": "user_activities",
      "name": "user_activities_pkey",
      "type": "p",
      "definition": "PRIMARY KEY (id)",
      "validated": true
    },
    {
      "table_name": "user_activities",
      "name": "user_activities_user_id_users_id_fk",
      "type": "f",
      "definition": "FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL",
      "validated": true
    },
    {
      "table_name": "user_roles",
      "name": "uq_user_roles",
      "type": "u",
      "definition": "UNIQUE (user_id, role_id)",
      "validated": true
    },
    {
      "table_name": "user_roles",
      "name": "user_roles_pkey",
      "type": "p",
      "definition": "PRIMARY KEY (id)",
      "validated": true
    },
    {
      "table_name": "user_roles",
      "name": "user_roles_role_id_roles_id_fk",
      "type": "f",
      "definition": "FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE",
      "validated": true
    },
    {
      "table_name": "user_roles",
      "name": "user_roles_user_id_users_id_fk",
      "type": "f",
      "definition": "FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE",
      "validated": true
    },
    {
      "table_name": "users",
      "name": "users_contact_number_ph_mobile_check",
      "type": "c",
      "definition": "CHECK (contact_number::text ~ '^\\+639[0-9]{9}$'::text)",
      "validated": true
    },
    {
      "table_name": "users",
      "name": "users_pkey",
      "type": "p",
      "definition": "PRIMARY KEY (id)",
      "validated": true
    },
    {
      "table_name": "users",
      "name": "users_username_key",
      "type": "u",
      "definition": "UNIQUE (username)",
      "validated": true
    },
    {
      "table_name": "wholesale_clients",
      "name": "wholesale_clients_pkey",
      "type": "p",
      "definition": "PRIMARY KEY (id)",
      "validated": true
    },
    {
      "table_name": "wholesale_order_items",
      "name": "wholesale_order_items_line_total_check",
      "type": "c",
      "definition": "CHECK (line_total >= 0::numeric)",
      "validated": true
    },
    {
      "table_name": "wholesale_order_items",
      "name": "wholesale_order_items_order_id_wholesale_orders_id_fk",
      "type": "f",
      "definition": "FOREIGN KEY (order_id) REFERENCES wholesale_orders(id) ON DELETE CASCADE",
      "validated": true
    },
    {
      "table_name": "wholesale_order_items",
      "name": "wholesale_order_items_pkey",
      "type": "p",
      "definition": "PRIMARY KEY (id)",
      "validated": true
    },
    {
      "table_name": "wholesale_order_items",
      "name": "wholesale_order_items_product_id_products_id_fk",
      "type": "f",
      "definition": "FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT",
      "validated": true
    },
    {
      "table_name": "wholesale_order_items",
      "name": "wholesale_order_items_quantity_check",
      "type": "c",
      "definition": "CHECK (quantity > 0)",
      "validated": true
    },
    {
      "table_name": "wholesale_order_items",
      "name": "wholesale_order_items_unit_price_check",
      "type": "c",
      "definition": "CHECK (unit_price >= 0::numeric)",
      "validated": true
    },
    {
      "table_name": "wholesale_orders",
      "name": "wholesale_orders_client_id_wholesale_clients_id_fk",
      "type": "f",
      "definition": "FOREIGN KEY (client_id) REFERENCES wholesale_clients(id) ON DELETE RESTRICT",
      "validated": true
    },
    {
      "table_name": "wholesale_orders",
      "name": "wholesale_orders_contract_id_client_contracts_id_fk",
      "type": "f",
      "definition": "FOREIGN KEY (contract_id) REFERENCES client_contracts(id) ON DELETE SET NULL",
      "validated": true
    },
    {
      "table_name": "wholesale_orders",
      "name": "wholesale_orders_pkey",
      "type": "p",
      "definition": "PRIMARY KEY (id)",
      "validated": true
    },
    {
      "table_name": "wholesale_orders",
      "name": "wholesale_orders_total_order_amount_check",
      "type": "c",
      "definition": "CHECK (total_order_amount >= 0::numeric)",
      "validated": true
    }
  ],
  "indexes": [
    {
      "table_name": "accounts_payable",
      "name": "accounts_payable_invoice_id_key",
      "definition": "CREATE UNIQUE INDEX accounts_payable_invoice_id_key ON public.accounts_payable USING btree (invoice_id)"
    },
    {
      "table_name": "accounts_payable",
      "name": "accounts_payable_pkey",
      "definition": "CREATE UNIQUE INDEX accounts_payable_pkey ON public.accounts_payable USING btree (id)"
    },
    {
      "table_name": "accounts_payable",
      "name": "idx_accounts_payable_invoice_id",
      "definition": "CREATE INDEX idx_accounts_payable_invoice_id ON public.accounts_payable USING btree (invoice_id)"
    },
    {
      "table_name": "accounts_payable",
      "name": "idx_accounts_payable_supplier_id",
      "definition": "CREATE INDEX idx_accounts_payable_supplier_id ON public.accounts_payable USING btree (supplier_id)"
    },
    {
      "table_name": "accounts_receivable",
      "name": "accounts_receivable_order_id_key",
      "definition": "CREATE UNIQUE INDEX accounts_receivable_order_id_key ON public.accounts_receivable USING btree (order_id)"
    },
    {
      "table_name": "accounts_receivable",
      "name": "accounts_receivable_pkey",
      "definition": "CREATE UNIQUE INDEX accounts_receivable_pkey ON public.accounts_receivable USING btree (id)"
    },
    {
      "table_name": "accounts_receivable",
      "name": "idx_accounts_receivable_client_id",
      "definition": "CREATE INDEX idx_accounts_receivable_client_id ON public.accounts_receivable USING btree (client_id)"
    },
    {
      "table_name": "accounts_receivable",
      "name": "idx_accounts_receivable_order_id",
      "definition": "CREATE INDEX idx_accounts_receivable_order_id ON public.accounts_receivable USING btree (order_id)"
    },
    {
      "table_name": "ar_payments",
      "name": "ar_payments_pkey",
      "definition": "CREATE UNIQUE INDEX ar_payments_pkey ON public.ar_payments USING btree (id)"
    },
    {
      "table_name": "ar_payments",
      "name": "idx_ar_payments_ar_id",
      "definition": "CREATE INDEX idx_ar_payments_ar_id ON public.ar_payments USING btree (ar_id)"
    },
    {
      "table_name": "backup_records",
      "name": "backup_records_pkey",
      "definition": "CREATE UNIQUE INDEX backup_records_pkey ON public.backup_records USING btree (id)"
    },
    {
      "table_name": "batch_info",
      "name": "batch_info_pkey",
      "definition": "CREATE UNIQUE INDEX batch_info_pkey ON public.batch_info USING btree (id)"
    },
    {
      "table_name": "batch_info",
      "name": "idx_batch_info_expiration_date",
      "definition": "CREATE INDEX idx_batch_info_expiration_date ON public.batch_info USING btree (expiration_date)"
    },
    {
      "table_name": "batch_info",
      "name": "idx_batch_info_product_id",
      "definition": "CREATE INDEX idx_batch_info_product_id ON public.batch_info USING btree (product_id)"
    },
    {
      "table_name": "batch_info",
      "name": "uq_product_batch",
      "definition": "CREATE UNIQUE INDEX uq_product_batch ON public.batch_info USING btree (product_id, batch_number)"
    },
    {
      "table_name": "cash_reconciliations",
      "name": "cash_reconciliations_pkey",
      "definition": "CREATE UNIQUE INDEX cash_reconciliations_pkey ON public.cash_reconciliations USING btree (id)"
    },
    {
      "table_name": "cash_reconciliations",
      "name": "idx_cash_reconciliations_date",
      "definition": "CREATE INDEX idx_cash_reconciliations_date ON public.cash_reconciliations USING btree (reconciliation_date)"
    },
    {
      "table_name": "client_contract_items",
      "name": "client_contract_items_pkey",
      "definition": "CREATE UNIQUE INDEX client_contract_items_pkey ON public.client_contract_items USING btree (id)"
    },
    {
      "table_name": "client_contract_items",
      "name": "uq_contract_product",
      "definition": "CREATE UNIQUE INDEX uq_contract_product ON public.client_contract_items USING btree (contract_id, product_id)"
    },
    {
      "table_name": "client_contracts",
      "name": "client_contracts_pkey",
      "definition": "CREATE UNIQUE INDEX client_contracts_pkey ON public.client_contracts USING btree (id)"
    },
    {
      "table_name": "client_contracts",
      "name": "idx_client_contracts_client_id",
      "definition": "CREATE INDEX idx_client_contracts_client_id ON public.client_contracts USING btree (client_id)"
    },
    {
      "table_name": "customers",
      "name": "customers_pkey",
      "definition": "CREATE UNIQUE INDEX customers_pkey ON public.customers USING btree (id)"
    },
    {
      "table_name": "dashboards",
      "name": "dashboards_pkey",
      "definition": "CREATE UNIQUE INDEX dashboards_pkey ON public.dashboards USING btree (id)"
    },
    {
      "table_name": "dashboards",
      "name": "dashboards_user_id_key",
      "definition": "CREATE UNIQUE INDEX dashboards_user_id_key ON public.dashboards USING btree (user_id)"
    },
    {
      "table_name": "delivery_items",
      "name": "delivery_items_pkey",
      "definition": "CREATE UNIQUE INDEX delivery_items_pkey ON public.delivery_items USING btree (id)"
    },
    {
      "table_name": "delivery_items",
      "name": "idx_delivery_items_delivery_id",
      "definition": "CREATE INDEX idx_delivery_items_delivery_id ON public.delivery_items USING btree (delivery_id)"
    },
    {
      "table_name": "delivery_receipt_items",
      "name": "delivery_receipt_items_pkey",
      "definition": "CREATE UNIQUE INDEX delivery_receipt_items_pkey ON public.delivery_receipt_items USING btree (id)"
    },
    {
      "table_name": "delivery_receipts",
      "name": "delivery_receipts_pkey",
      "definition": "CREATE UNIQUE INDEX delivery_receipts_pkey ON public.delivery_receipts USING btree (id)"
    },
    {
      "table_name": "delivery_receipts",
      "name": "delivery_receipts_receipt_number_key",
      "definition": "CREATE UNIQUE INDEX delivery_receipts_receipt_number_key ON public.delivery_receipts USING btree (receipt_number)"
    },
    {
      "table_name": "delivery_receipts",
      "name": "idx_delivery_receipts_order_id",
      "definition": "CREATE INDEX idx_delivery_receipts_order_id ON public.delivery_receipts USING btree (order_id)"
    },
    {
      "table_name": "delivery_schedules",
      "name": "delivery_schedules_pkey",
      "definition": "CREATE UNIQUE INDEX delivery_schedules_pkey ON public.delivery_schedules USING btree (id)"
    },
    {
      "table_name": "delivery_schedules",
      "name": "idx_delivery_schedules_order_id",
      "definition": "CREATE INDEX idx_delivery_schedules_order_id ON public.delivery_schedules USING btree (order_id)"
    },
    {
      "table_name": "discounts",
      "name": "discounts_pkey",
      "definition": "CREATE UNIQUE INDEX discounts_pkey ON public.discounts USING btree (id)"
    },
    {
      "table_name": "discounts",
      "name": "idx_discounts_transaction_id",
      "definition": "CREATE INDEX idx_discounts_transaction_id ON public.discounts USING btree (transaction_id)"
    },
    {
      "table_name": "inventory_alerts",
      "name": "idx_inventory_alerts_is_resolved",
      "definition": "CREATE INDEX idx_inventory_alerts_is_resolved ON public.inventory_alerts USING btree (is_resolved)"
    },
    {
      "table_name": "inventory_alerts",
      "name": "idx_inventory_alerts_product_id",
      "definition": "CREATE INDEX idx_inventory_alerts_product_id ON public.inventory_alerts USING btree (product_id)"
    },
    {
      "table_name": "inventory_alerts",
      "name": "inventory_alerts_pkey",
      "definition": "CREATE UNIQUE INDEX inventory_alerts_pkey ON public.inventory_alerts USING btree (id)"
    },
    {
      "table_name": "permissions",
      "name": "permissions_pkey",
      "definition": "CREATE UNIQUE INDEX permissions_pkey ON public.permissions USING btree (id)"
    },
    {
      "table_name": "permissions",
      "name": "uq_permissions_module_type",
      "definition": "CREATE UNIQUE INDEX uq_permissions_module_type ON public.permissions USING btree (module_name, permission_type)"
    },
    {
      "table_name": "po_items",
      "name": "idx_po_items_po_id",
      "definition": "CREATE INDEX idx_po_items_po_id ON public.po_items USING btree (po_id)"
    },
    {
      "table_name": "po_items",
      "name": "po_items_pkey",
      "definition": "CREATE UNIQUE INDEX po_items_pkey ON public.po_items USING btree (id)"
    },
    {
      "table_name": "products",
      "name": "idx_products_category",
      "definition": "CREATE INDEX idx_products_category ON public.products USING btree (category)"
    },
    {
      "table_name": "products",
      "name": "idx_products_generic_name",
      "definition": "CREATE INDEX idx_products_generic_name ON public.products USING btree (generic_name)"
    },
    {
      "table_name": "products",
      "name": "products_pkey",
      "definition": "CREATE UNIQUE INDEX products_pkey ON public.products USING btree (id)"
    },
    {
      "table_name": "products",
      "name": "uq_products_sku",
      "definition": "CREATE UNIQUE INDEX uq_products_sku ON public.products USING btree (sku)"
    },
    {
      "table_name": "purchase_orders",
      "name": "idx_purchase_orders_status",
      "definition": "CREATE INDEX idx_purchase_orders_status ON public.purchase_orders USING btree (status)"
    },
    {
      "table_name": "purchase_orders",
      "name": "idx_purchase_orders_supplier_id",
      "definition": "CREATE INDEX idx_purchase_orders_supplier_id ON public.purchase_orders USING btree (supplier_id)"
    },
    {
      "table_name": "purchase_orders",
      "name": "purchase_orders_pkey",
      "definition": "CREATE UNIQUE INDEX purchase_orders_pkey ON public.purchase_orders USING btree (id)"
    },
    {
      "table_name": "purchase_orders",
      "name": "purchase_orders_po_number_key",
      "definition": "CREATE UNIQUE INDEX purchase_orders_po_number_key ON public.purchase_orders USING btree (po_number)"
    },
    {
      "table_name": "receipts",
      "name": "receipts_pkey",
      "definition": "CREATE UNIQUE INDEX receipts_pkey ON public.receipts USING btree (id)"
    },
    {
      "table_name": "receipts",
      "name": "receipts_receipt_number_key",
      "definition": "CREATE UNIQUE INDEX receipts_receipt_number_key ON public.receipts USING btree (receipt_number)"
    },
    {
      "table_name": "receipts",
      "name": "receipts_transaction_id_key",
      "definition": "CREATE UNIQUE INDEX receipts_transaction_id_key ON public.receipts USING btree (transaction_id)"
    },
    {
      "table_name": "reports",
      "name": "idx_reports_date_range",
      "definition": "CREATE INDEX idx_reports_date_range ON public.reports USING btree (date_from, date_to)"
    },
    {
      "table_name": "reports",
      "name": "idx_reports_report_type",
      "definition": "CREATE INDEX idx_reports_report_type ON public.reports USING btree (report_type)"
    },
    {
      "table_name": "reports",
      "name": "reports_pkey",
      "definition": "CREATE UNIQUE INDEX reports_pkey ON public.reports USING btree (id)"
    },
    {
      "table_name": "role_permissions",
      "name": "role_permissions_pkey",
      "definition": "CREATE UNIQUE INDEX role_permissions_pkey ON public.role_permissions USING btree (id)"
    },
    {
      "table_name": "role_permissions",
      "name": "uq_role_permissions",
      "definition": "CREATE UNIQUE INDEX uq_role_permissions ON public.role_permissions USING btree (role_id, permission_id)"
    },
    {
      "table_name": "roles",
      "name": "roles_pkey",
      "definition": "CREATE UNIQUE INDEX roles_pkey ON public.roles USING btree (id)"
    },
    {
      "table_name": "roles",
      "name": "roles_role_name_key",
      "definition": "CREATE UNIQUE INDEX roles_role_name_key ON public.roles USING btree (role_name)"
    },
    {
      "table_name": "stock_movements",
      "name": "idx_stock_movements_batch_id",
      "definition": "CREATE INDEX idx_stock_movements_batch_id ON public.stock_movements USING btree (batch_id)"
    },
    {
      "table_name": "stock_movements",
      "name": "idx_stock_movements_movement_date",
      "definition": "CREATE INDEX idx_stock_movements_movement_date ON public.stock_movements USING btree (movement_date)"
    },
    {
      "table_name": "stock_movements",
      "name": "idx_stock_movements_product_id",
      "definition": "CREATE INDEX idx_stock_movements_product_id ON public.stock_movements USING btree (product_id)"
    },
    {
      "table_name": "stock_movements",
      "name": "stock_movements_pkey",
      "definition": "CREATE UNIQUE INDEX stock_movements_pkey ON public.stock_movements USING btree (id)"
    },
    {
      "table_name": "supplier_deliveries",
      "name": "idx_supplier_deliveries_po_id",
      "definition": "CREATE INDEX idx_supplier_deliveries_po_id ON public.supplier_deliveries USING btree (po_id)"
    },
    {
      "table_name": "supplier_deliveries",
      "name": "supplier_deliveries_pkey",
      "definition": "CREATE UNIQUE INDEX supplier_deliveries_pkey ON public.supplier_deliveries USING btree (id)"
    },
    {
      "table_name": "supplier_invoices",
      "name": "idx_supplier_invoices_po_id",
      "definition": "CREATE INDEX idx_supplier_invoices_po_id ON public.supplier_invoices USING btree (po_id)"
    },
    {
      "table_name": "supplier_invoices",
      "name": "idx_supplier_invoices_supplier_id",
      "definition": "CREATE INDEX idx_supplier_invoices_supplier_id ON public.supplier_invoices USING btree (supplier_id)"
    },
    {
      "table_name": "supplier_invoices",
      "name": "supplier_invoices_invoice_number_key",
      "definition": "CREATE UNIQUE INDEX supplier_invoices_invoice_number_key ON public.supplier_invoices USING btree (invoice_number)"
    },
    {
      "table_name": "supplier_invoices",
      "name": "supplier_invoices_pkey",
      "definition": "CREATE UNIQUE INDEX supplier_invoices_pkey ON public.supplier_invoices USING btree (id)"
    },
    {
      "table_name": "supplier_payments",
      "name": "idx_supplier_payments_ap_id",
      "definition": "CREATE INDEX idx_supplier_payments_ap_id ON public.supplier_payments USING btree (ap_id)"
    },
    {
      "table_name": "supplier_payments",
      "name": "supplier_payments_pkey",
      "definition": "CREATE UNIQUE INDEX supplier_payments_pkey ON public.supplier_payments USING btree (id)"
    },
    {
      "table_name": "suppliers",
      "name": "suppliers_pkey",
      "definition": "CREATE UNIQUE INDEX suppliers_pkey ON public.suppliers USING btree (id)"
    },
    {
      "table_name": "system_logs",
      "name": "idx_system_logs_module",
      "definition": "CREATE INDEX idx_system_logs_module ON public.system_logs USING btree (module)"
    },
    {
      "table_name": "system_logs",
      "name": "idx_system_logs_timestamp",
      "definition": "CREATE INDEX idx_system_logs_timestamp ON public.system_logs USING btree (\"timestamp\")"
    },
    {
      "table_name": "system_logs",
      "name": "idx_system_logs_user_id",
      "definition": "CREATE INDEX idx_system_logs_user_id ON public.system_logs USING btree (user_id)"
    },
    {
      "table_name": "system_logs",
      "name": "system_logs_pkey",
      "definition": "CREATE UNIQUE INDEX system_logs_pkey ON public.system_logs USING btree (id)"
    },
    {
      "table_name": "transaction_items",
      "name": "idx_transaction_items_product_id",
      "definition": "CREATE INDEX idx_transaction_items_product_id ON public.transaction_items USING btree (product_id)"
    },
    {
      "table_name": "transaction_items",
      "name": "idx_transaction_items_transaction_id",
      "definition": "CREATE INDEX idx_transaction_items_transaction_id ON public.transaction_items USING btree (transaction_id)"
    },
    {
      "table_name": "transaction_items",
      "name": "transaction_items_pkey",
      "definition": "CREATE UNIQUE INDEX transaction_items_pkey ON public.transaction_items USING btree (id)"
    },
    {
      "table_name": "transactions",
      "name": "idx_transactions_cashier_id",
      "definition": "CREATE INDEX idx_transactions_cashier_id ON public.transactions USING btree (cashier_id)"
    },
    {
      "table_name": "transactions",
      "name": "idx_transactions_customer_id",
      "definition": "CREATE INDEX idx_transactions_customer_id ON public.transactions USING btree (customer_id)"
    },
    {
      "table_name": "transactions",
      "name": "idx_transactions_date",
      "definition": "CREATE INDEX idx_transactions_date ON public.transactions USING btree (transaction_date)"
    },
    {
      "table_name": "transactions",
      "name": "idx_transactions_status",
      "definition": "CREATE INDEX idx_transactions_status ON public.transactions USING btree (status)"
    },
    {
      "table_name": "transactions",
      "name": "transactions_pkey",
      "definition": "CREATE UNIQUE INDEX transactions_pkey ON public.transactions USING btree (id)"
    },
    {
      "table_name": "user_activities",
      "name": "idx_user_activities_flag",
      "definition": "CREATE INDEX idx_user_activities_flag ON public.user_activities USING btree (flag)"
    },
    {
      "table_name": "user_activities",
      "name": "idx_user_activities_module",
      "definition": "CREATE INDEX idx_user_activities_module ON public.user_activities USING btree (module)"
    },
    {
      "table_name": "user_activities",
      "name": "idx_user_activities_timestamp",
      "definition": "CREATE INDEX idx_user_activities_timestamp ON public.user_activities USING btree (\"timestamp\")"
    },
    {
      "table_name": "user_activities",
      "name": "idx_user_activities_user_id",
      "definition": "CREATE INDEX idx_user_activities_user_id ON public.user_activities USING btree (user_id)"
    },
    {
      "table_name": "user_activities",
      "name": "user_activities_pkey",
      "definition": "CREATE UNIQUE INDEX user_activities_pkey ON public.user_activities USING btree (id)"
    },
    {
      "table_name": "user_roles",
      "name": "uq_user_roles",
      "definition": "CREATE UNIQUE INDEX uq_user_roles ON public.user_roles USING btree (user_id, role_id)"
    },
    {
      "table_name": "user_roles",
      "name": "user_roles_pkey",
      "definition": "CREATE UNIQUE INDEX user_roles_pkey ON public.user_roles USING btree (id)"
    },
    {
      "table_name": "users",
      "name": "users_pkey",
      "definition": "CREATE UNIQUE INDEX users_pkey ON public.users USING btree (id)"
    },
    {
      "table_name": "users",
      "name": "users_username_key",
      "definition": "CREATE UNIQUE INDEX users_username_key ON public.users USING btree (username)"
    },
    {
      "table_name": "wholesale_clients",
      "name": "wholesale_clients_pkey",
      "definition": "CREATE UNIQUE INDEX wholesale_clients_pkey ON public.wholesale_clients USING btree (id)"
    },
    {
      "table_name": "wholesale_order_items",
      "name": "idx_wholesale_order_items_order_id",
      "definition": "CREATE INDEX idx_wholesale_order_items_order_id ON public.wholesale_order_items USING btree (order_id)"
    },
    {
      "table_name": "wholesale_order_items",
      "name": "wholesale_order_items_pkey",
      "definition": "CREATE UNIQUE INDEX wholesale_order_items_pkey ON public.wholesale_order_items USING btree (id)"
    },
    {
      "table_name": "wholesale_orders",
      "name": "idx_wholesale_orders_client_id",
      "definition": "CREATE INDEX idx_wholesale_orders_client_id ON public.wholesale_orders USING btree (client_id)"
    },
    {
      "table_name": "wholesale_orders",
      "name": "idx_wholesale_orders_status",
      "definition": "CREATE INDEX idx_wholesale_orders_status ON public.wholesale_orders USING btree (status)"
    },
    {
      "table_name": "wholesale_orders",
      "name": "wholesale_orders_pkey",
      "definition": "CREATE UNIQUE INDEX wholesale_orders_pkey ON public.wholesale_orders USING btree (id)"
    }
  ],
  "enums": [
    {
      "name": "activity_flag_enum",
      "labels": [
        "Normal",
        "Suspicious",
        "Flagged"
      ]
    },
    {
      "name": "alert_severity_enum",
      "labels": [
        "Low",
        "Medium",
        "High",
        "Critical"
      ]
    },
    {
      "name": "alert_type_enum",
      "labels": [
        "LowStock",
        "NearExpiry",
        "Expired"
      ]
    },
    {
      "name": "delivery_schedule_status_enum",
      "labels": [
        "Scheduled",
        "InTransit",
        "Completed",
        "Failed",
        "Cancelled"
      ]
    },
    {
      "name": "delivery_status_enum",
      "labels": [
        "Pending",
        "Received",
        "Partial",
        "Inspected",
        "Rejected"
      ]
    },
    {
      "name": "log_status_enum",
      "labels": [
        "Success",
        "Failed",
        "Warning"
      ]
    },
    {
      "name": "po_status_enum",
      "labels": [
        "Draft",
        "Pending",
        "Approved",
        "Submitted",
        "Fulfilled",
        "Cancelled"
      ]
    },
    {
      "name": "stock_movement_type_enum",
      "labels": [
        "StockIn",
        "StockOut",
        "Sale",
        "Adjustment",
        "Disposal",
        "Return"
      ]
    },
    {
      "name": "transaction_status_enum",
      "labels": [
        "Pending",
        "Completed",
        "Cancelled",
        "Voided"
      ]
    },
    {
      "name": "user_role_enum",
      "labels": [
        "Admin",
        "Cashier",
        "FrontDesk"
      ]
    },
    {
      "name": "wholesale_order_status_enum",
      "labels": [
        "Pending",
        "Confirmed",
        "Processing",
        "Delivered",
        "Cancelled"
      ]
    }
  ]
};
export const cashierContract = {
  "tables": [
    "cashier_payment_migrations",
    "cashier_system_logs",
    "cashier_transactions",
    "cashier_user_activities"
  ],
  "columns": [
    {
      "table_name": "cashier_payment_migrations",
      "name": "name",
      "type": "text",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "cashier_system_logs",
      "name": "id",
      "type": "integer",
      "not_null": true,
      "default_value": "nextval('cashier_system_logs_id_seq'::regclass)"
    },
    {
      "table_name": "cashier_system_logs",
      "name": "date_time",
      "type": "character varying(100)",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "cashier_system_logs",
      "name": "user_name",
      "type": "character varying(150)",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "cashier_system_logs",
      "name": "role",
      "type": "character varying(50)",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "cashier_system_logs",
      "name": "action",
      "type": "character varying(100)",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "cashier_system_logs",
      "name": "module",
      "type": "character varying(100)",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "cashier_system_logs",
      "name": "description",
      "type": "text",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "cashier_system_logs",
      "name": "status",
      "type": "character varying(50)",
      "not_null": true,
      "default_value": "'Success'::character varying"
    },
    {
      "table_name": "cashier_system_logs",
      "name": "device_ip",
      "type": "character varying(50)",
      "not_null": true,
      "default_value": "'127.0.0.1'::character varying"
    },
    {
      "table_name": "cashier_system_logs",
      "name": "created_at",
      "type": "timestamp with time zone",
      "not_null": true,
      "default_value": "now()"
    },
    {
      "table_name": "cashier_transactions",
      "name": "id",
      "type": "integer",
      "not_null": true,
      "default_value": "nextval('cashier_transactions_id_seq'::regclass)"
    },
    {
      "table_name": "cashier_transactions",
      "name": "transaction_number",
      "type": "character varying(100)",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "cashier_transactions",
      "name": "date_time",
      "type": "character varying(100)",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "cashier_transactions",
      "name": "user_name",
      "type": "character varying(150)",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "cashier_transactions",
      "name": "business_type",
      "type": "character varying(50)",
      "not_null": true,
      "default_value": "'Retail'::character varying"
    },
    {
      "table_name": "cashier_transactions",
      "name": "customer",
      "type": "character varying(150)",
      "not_null": true,
      "default_value": "'Walk-in Customer'::character varying"
    },
    {
      "table_name": "cashier_transactions",
      "name": "total",
      "type": "character varying(50)",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "cashier_transactions",
      "name": "subtotal",
      "type": "character varying(50)",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "cashier_transactions",
      "name": "discount",
      "type": "character varying(50)",
      "not_null": true,
      "default_value": "'₱0.00'::character varying"
    },
    {
      "table_name": "cashier_transactions",
      "name": "vat",
      "type": "character varying(50)",
      "not_null": true,
      "default_value": "'₱0.00'::character varying"
    },
    {
      "table_name": "cashier_transactions",
      "name": "amount_received",
      "type": "character varying(50)",
      "not_null": true,
      "default_value": "'₱0.00'::character varying"
    },
    {
      "table_name": "cashier_transactions",
      "name": "change",
      "type": "character varying(50)",
      "not_null": true,
      "default_value": "'₱0.00'::character varying"
    },
    {
      "table_name": "cashier_transactions",
      "name": "payment",
      "type": "character varying(50)",
      "not_null": true,
      "default_value": "'Cash'::character varying"
    },
    {
      "table_name": "cashier_transactions",
      "name": "status",
      "type": "character varying(50)",
      "not_null": true,
      "default_value": "'Completed'::character varying"
    },
    {
      "table_name": "cashier_transactions",
      "name": "items",
      "type": "jsonb",
      "not_null": true,
      "default_value": "'[]'::jsonb"
    },
    {
      "table_name": "cashier_transactions",
      "name": "created_at",
      "type": "timestamp with time zone",
      "not_null": true,
      "default_value": "now()"
    },
    {
      "table_name": "cashier_transactions",
      "name": "legacy_transaction_number",
      "type": "character varying(100)",
      "not_null": false,
      "default_value": null
    },
    {
      "table_name": "cashier_transactions",
      "name": "checkout_request_key",
      "type": "text",
      "not_null": false,
      "default_value": null
    },
    {
      "table_name": "cashier_transactions",
      "name": "checkout_payload",
      "type": "jsonb",
      "not_null": false,
      "default_value": null
    },
    {
      "table_name": "cashier_user_activities",
      "name": "id",
      "type": "integer",
      "not_null": true,
      "default_value": "nextval('cashier_user_activities_id_seq'::regclass)"
    },
    {
      "table_name": "cashier_user_activities",
      "name": "date_time",
      "type": "character varying(100)",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "cashier_user_activities",
      "name": "user_name",
      "type": "character varying(150)",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "cashier_user_activities",
      "name": "role",
      "type": "character varying(50)",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "cashier_user_activities",
      "name": "activity",
      "type": "character varying(150)",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "cashier_user_activities",
      "name": "module",
      "type": "character varying(100)",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "cashier_user_activities",
      "name": "description",
      "type": "text",
      "not_null": true,
      "default_value": null
    },
    {
      "table_name": "cashier_user_activities",
      "name": "flag",
      "type": "character varying(50)",
      "not_null": true,
      "default_value": "'Normal'::character varying"
    },
    {
      "table_name": "cashier_user_activities",
      "name": "created_at",
      "type": "timestamp with time zone",
      "not_null": true,
      "default_value": "now()"
    }
  ],
  "constraints": [
    {
      "table_name": "cashier_payment_migrations",
      "name": "cashier_payment_migrations_pkey",
      "type": "p",
      "definition": "PRIMARY KEY (name)",
      "validated": true
    },
    {
      "table_name": "cashier_system_logs",
      "name": "cashier_system_logs_pkey",
      "type": "p",
      "definition": "PRIMARY KEY (id)",
      "validated": true
    },
    {
      "table_name": "cashier_transactions",
      "name": "cashier_transactions_pkey",
      "type": "p",
      "definition": "PRIMARY KEY (id)",
      "validated": true
    },
    {
      "table_name": "cashier_transactions",
      "name": "cashier_transactions_transaction_number_key",
      "type": "u",
      "definition": "UNIQUE (transaction_number)",
      "validated": true
    },
    {
      "table_name": "cashier_user_activities",
      "name": "cashier_user_activities_pkey",
      "type": "p",
      "definition": "PRIMARY KEY (id)",
      "validated": true
    }
  ],
  "indexes": [
    {
      "table_name": "cashier_payment_migrations",
      "name": "cashier_payment_migrations_pkey",
      "definition": "CREATE UNIQUE INDEX cashier_payment_migrations_pkey ON public.cashier_payment_migrations USING btree (name)"
    },
    {
      "table_name": "cashier_system_logs",
      "name": "cashier_system_logs_pkey",
      "definition": "CREATE UNIQUE INDEX cashier_system_logs_pkey ON public.cashier_system_logs USING btree (id)"
    },
    {
      "table_name": "cashier_transactions",
      "name": "cashier_checkout_request_key_idx",
      "definition": "CREATE UNIQUE INDEX cashier_checkout_request_key_idx ON public.cashier_transactions USING btree (checkout_request_key)"
    },
    {
      "table_name": "cashier_transactions",
      "name": "cashier_transactions_pkey",
      "definition": "CREATE UNIQUE INDEX cashier_transactions_pkey ON public.cashier_transactions USING btree (id)"
    },
    {
      "table_name": "cashier_transactions",
      "name": "cashier_transactions_transaction_number_key",
      "definition": "CREATE UNIQUE INDEX cashier_transactions_transaction_number_key ON public.cashier_transactions USING btree (transaction_number)"
    },
    {
      "table_name": "cashier_user_activities",
      "name": "cashier_user_activities_pkey",
      "definition": "CREATE UNIQUE INDEX cashier_user_activities_pkey ON public.cashier_user_activities USING btree (id)"
    }
  ],
  "enums": []
};

export const timestampTriggers = [
  {
    "table_name": "accounts_payable",
    "name": "trg_accounts_payable_updated_at",
    "definition": "CREATE TRIGGER trg_accounts_payable_updated_at BEFORE UPDATE ON accounts_payable FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()"
  },
  {
    "table_name": "accounts_receivable",
    "name": "trg_accounts_receivable_updated_at",
    "definition": "CREATE TRIGGER trg_accounts_receivable_updated_at BEFORE UPDATE ON accounts_receivable FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()"
  },
  {
    "table_name": "batch_info",
    "name": "trg_batch_info_updated_at",
    "definition": "CREATE TRIGGER trg_batch_info_updated_at BEFORE UPDATE ON batch_info FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()"
  },
  {
    "table_name": "client_contracts",
    "name": "trg_client_contracts_updated_at",
    "definition": "CREATE TRIGGER trg_client_contracts_updated_at BEFORE UPDATE ON client_contracts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()"
  },
  {
    "table_name": "customers",
    "name": "trg_customers_updated_at",
    "definition": "CREATE TRIGGER trg_customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()"
  },
  {
    "table_name": "dashboards",
    "name": "trg_dashboards_updated_at",
    "definition": "CREATE TRIGGER trg_dashboards_updated_at BEFORE UPDATE ON dashboards FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()"
  },
  {
    "table_name": "products",
    "name": "trg_products_updated_at",
    "definition": "CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()"
  },
  {
    "table_name": "purchase_orders",
    "name": "trg_purchase_orders_updated_at",
    "definition": "CREATE TRIGGER trg_purchase_orders_updated_at BEFORE UPDATE ON purchase_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()"
  },
  {
    "table_name": "suppliers",
    "name": "trg_suppliers_updated_at",
    "definition": "CREATE TRIGGER trg_suppliers_updated_at BEFORE UPDATE ON suppliers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()"
  },
  {
    "table_name": "transactions",
    "name": "trg_transactions_updated_at",
    "definition": "CREATE TRIGGER trg_transactions_updated_at BEFORE UPDATE ON transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()"
  },
  {
    "table_name": "users",
    "name": "trg_users_updated_at",
    "definition": "CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()"
  },
  {
    "table_name": "wholesale_clients",
    "name": "trg_wholesale_clients_updated_at",
    "definition": "CREATE TRIGGER trg_wholesale_clients_updated_at BEFORE UPDATE ON wholesale_clients FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()"
  },
  {
    "table_name": "wholesale_orders",
    "name": "trg_wholesale_orders_updated_at",
    "definition": "CREATE TRIGGER trg_wholesale_orders_updated_at BEFORE UPDATE ON wholesale_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()"
  }
];
