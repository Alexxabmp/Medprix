CREATE TYPE "public"."user_role_enum" AS ENUM('Admin', 'Cashier', 'FrontDesk');--> statement-breakpoint
CREATE TYPE "public"."log_status_enum" AS ENUM('Success', 'Failed', 'Warning');--> statement-breakpoint
CREATE TYPE "public"."activity_flag_enum" AS ENUM('Normal', 'Suspicious', 'Flagged');--> statement-breakpoint
CREATE TYPE "public"."alert_severity_enum" AS ENUM('Low', 'Medium', 'High', 'Critical');--> statement-breakpoint
CREATE TYPE "public"."alert_type_enum" AS ENUM('LowStock', 'NearExpiry', 'Expired');--> statement-breakpoint
CREATE TYPE "public"."stock_movement_type_enum" AS ENUM('StockIn', 'StockOut', 'Sale', 'Adjustment', 'Disposal', 'Return');--> statement-breakpoint
CREATE TYPE "public"."transaction_status_enum" AS ENUM('Pending', 'Completed', 'Cancelled', 'Voided');--> statement-breakpoint
CREATE TYPE "public"."delivery_status_enum" AS ENUM('Pending', 'Received', 'Partial', 'Inspected', 'Rejected');--> statement-breakpoint
CREATE TYPE "public"."po_status_enum" AS ENUM('Draft', 'Pending', 'Approved', 'Submitted', 'Fulfilled', 'Cancelled');--> statement-breakpoint
CREATE TYPE "public"."delivery_schedule_status_enum" AS ENUM('Scheduled', 'InTransit', 'Completed', 'Failed', 'Cancelled');--> statement-breakpoint
CREATE TYPE "public"."wholesale_order_status_enum" AS ENUM('Pending', 'Confirmed', 'Processing', 'Delivered', 'Cancelled');--> statement-breakpoint
CREATE TABLE "backup_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"initiated_by_user_id" uuid,
	"backup_date" timestamp with time zone DEFAULT now() NOT NULL,
	"file_path" text NOT NULL,
	"status" varchar(50) DEFAULT 'Completed' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"module_name" varchar(100) NOT NULL,
	"permission_type" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_permissions_module_type" UNIQUE("module_name","permission_type")
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_role_permissions" UNIQUE("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role_name" varchar(100) NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_role_name_key" UNIQUE("role_name")
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_user_roles" UNIQUE("user_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" varchar(100) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"full_name" varchar(255) NOT NULL,
	"contact_number" varchar(13),
	"employee_code" varchar(50),
	"role" "user_role_enum" DEFAULT 'Cashier' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_key" UNIQUE("username"),
	CONSTRAINT "users_contact_number_ph_mobile_check" CHECK ("users"."contact_number" ~ '^\+639[0-9]{9}$')
);
--> statement-breakpoint
CREATE TABLE "system_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"action_type" varchar(100) NOT NULL,
	"module" varchar(100) NOT NULL,
	"description" text NOT NULL,
	"status" "log_status_enum" DEFAULT 'Success' NOT NULL,
	"device_ip" varchar(50),
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"activity" varchar(255) NOT NULL,
	"module" varchar(100) NOT NULL,
	"description" text NOT NULL,
	"flag" "activity_flag_enum" DEFAULT 'Normal' NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "batch_info" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"batch_number" varchar(100) NOT NULL,
	"expiration_date" date NOT NULL,
	"quantity_remaining" integer DEFAULT 0 NOT NULL,
	"mfg_date" date,
	"date_received" date,
	"supplier" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_product_batch" UNIQUE("product_id","batch_number"),
	CONSTRAINT "batch_info_quantity_remaining_check" CHECK ("batch_info"."quantity_remaining" >= 0)
);
--> statement-breakpoint
CREATE TABLE "inventory_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"batch_id" uuid,
	"alert_type" "alert_type_enum" NOT NULL,
	"severity" "alert_severity_enum" DEFAULT 'Medium' NOT NULL,
	"triggered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_resolved" boolean DEFAULT false NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sku" varchar(100) NOT NULL,
	"product_name" varchar(255) NOT NULL,
	"generic_name" varchar(255) NOT NULL,
	"category" varchar(100) NOT NULL,
	"is_dangerous_drug" boolean DEFAULT false NOT NULL,
	"selling_price" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"cost_price" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"minimum_stock_level" integer DEFAULT 0 NOT NULL,
	"current_stock" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_products_sku" UNIQUE("sku"),
	CONSTRAINT "products_selling_price_check" CHECK ("products"."selling_price" >= 0),
	CONSTRAINT "products_cost_price_check" CHECK ("products"."cost_price" >= 0),
	CONSTRAINT "products_minimum_stock_level_check" CHECK ("products"."minimum_stock_level" >= 0)
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"batch_id" uuid,
	"movement_type" "stock_movement_type_enum" NOT NULL,
	"quantity" integer NOT NULL,
	"movement_date" timestamp with time zone DEFAULT now() NOT NULL,
	"reference_id" uuid,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_name" varchar(255) NOT NULL,
	"discount_type" varchar(100) DEFAULT 'Regular',
	"id_number" varchar(100),
	"contact_number" varchar(50),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"discount_type" varchar(100) NOT NULL,
	"discount_rate" numeric(5, 2) DEFAULT '0.00' NOT NULL,
	"discount_amount" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discounts_discount_rate_check" CHECK ("discounts"."discount_rate" >= 0),
	CONSTRAINT "discounts_discount_amount_check" CHECK ("discounts"."discount_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"receipt_number" varchar(100) NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "receipts_transaction_id_key" UNIQUE("transaction_id"),
	CONSTRAINT "receipts_receipt_number_key" UNIQUE("receipt_number")
);
--> statement-breakpoint
CREATE TABLE "transaction_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"batch_id" uuid,
	"quantity" integer NOT NULL,
	"unit_price_at_sale" numeric(12, 2) NOT NULL,
	"subtotal" numeric(12, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transaction_items_quantity_check" CHECK ("transaction_items"."quantity" > 0),
	CONSTRAINT "transaction_items_unit_price_at_sale_check" CHECK ("transaction_items"."unit_price_at_sale" >= 0),
	CONSTRAINT "transaction_items_subtotal_check" CHECK ("transaction_items"."subtotal" >= 0)
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cashier_id" uuid,
	"customer_id" uuid,
	"transaction_date" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "transaction_status_enum" DEFAULT 'Completed' NOT NULL,
	"gross_amount" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"total_discount" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"vat_amount" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"net_amount" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"amount_tendered" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"change_amount" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"payment_method" varchar(50) DEFAULT 'Cash' NOT NULL,
	"void_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounts_payable" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"total_owed" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"total_paid" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"balance" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"last_payment_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_payable_invoice_id_key" UNIQUE("invoice_id"),
	CONSTRAINT "accounts_payable_total_owed_check" CHECK ("accounts_payable"."total_owed" >= 0),
	CONSTRAINT "accounts_payable_total_paid_check" CHECK ("accounts_payable"."total_paid" >= 0),
	CONSTRAINT "accounts_payable_balance_check" CHECK ("accounts_payable"."balance" >= 0)
);
--> statement-breakpoint
CREATE TABLE "delivery_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"delivery_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"batch_number" varchar(100) NOT NULL,
	"expiration_date" date NOT NULL,
	"quantity_delivered" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_items_quantity_delivered_check" CHECK ("delivery_items"."quantity_delivered" > 0)
);
--> statement-breakpoint
CREATE TABLE "po_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"po_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity_ordered" integer NOT NULL,
	"unit_cost" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"line_total" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "po_items_quantity_ordered_check" CHECK ("po_items"."quantity_ordered" > 0),
	CONSTRAINT "po_items_unit_cost_check" CHECK ("po_items"."unit_cost" >= 0),
	CONSTRAINT "po_items_line_total_check" CHECK ("po_items"."line_total" >= 0)
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"po_number" varchar(100) NOT NULL,
	"order_date" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "po_status_enum" DEFAULT 'Pending' NOT NULL,
	"total_order_amount" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_orders_po_number_key" UNIQUE("po_number"),
	CONSTRAINT "purchase_orders_total_order_amount_check" CHECK ("purchase_orders"."total_order_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "supplier_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"po_id" uuid NOT NULL,
	"delivery_date" timestamp with time zone DEFAULT now() NOT NULL,
	"delivery_status" "delivery_status_enum" DEFAULT 'Received' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"po_id" uuid,
	"supplier_id" uuid NOT NULL,
	"invoice_number" varchar(100) NOT NULL,
	"due_date" date NOT NULL,
	"invoice_amount" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"is_paid" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_invoices_invoice_number_key" UNIQUE("invoice_number"),
	CONSTRAINT "supplier_invoices_invoice_amount_check" CHECK ("supplier_invoices"."invoice_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "supplier_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ap_id" uuid NOT NULL,
	"payment_date" timestamp with time zone DEFAULT now() NOT NULL,
	"amount_paid" numeric(12, 2) NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_payments_amount_paid_check" CHECK ("supplier_payments"."amount_paid" > 0)
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_name" varchar(255) NOT NULL,
	"contact_person" varchar(255),
	"contact_number" varchar(50),
	"email" varchar(255),
	"address" text,
	"payment_terms" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounts_receivable" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"total_owed" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"total_paid" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"balance" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"due_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_receivable_order_id_key" UNIQUE("order_id"),
	CONSTRAINT "accounts_receivable_total_owed_check" CHECK ("accounts_receivable"."total_owed" >= 0),
	CONSTRAINT "accounts_receivable_total_paid_check" CHECK ("accounts_receivable"."total_paid" >= 0),
	CONSTRAINT "accounts_receivable_balance_check" CHECK ("accounts_receivable"."balance" >= 0)
);
--> statement-breakpoint
CREATE TABLE "ar_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ar_id" uuid NOT NULL,
	"payment_date" timestamp with time zone DEFAULT now() NOT NULL,
	"amount_paid" numeric(12, 2) NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ar_payments_amount_paid_check" CHECK ("ar_payments"."amount_paid" > 0)
);
--> statement-breakpoint
CREATE TABLE "client_contract_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"agreed_unit_price" numeric(12, 2) NOT NULL,
	CONSTRAINT "uq_contract_product" UNIQUE("contract_id","product_id"),
	CONSTRAINT "client_contract_items_agreed_unit_price_check" CHECK ("client_contract_items"."agreed_unit_price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "client_contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"effective_date" date NOT NULL,
	"expiry_date" date NOT NULL,
	"payment_terms" varchar(100),
	"status" varchar(50) DEFAULT 'Active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_receipt_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"batch_number" varchar(100) NOT NULL,
	"expiration_date" date NOT NULL,
	"quantity_delivered" integer NOT NULL,
	CONSTRAINT "delivery_receipt_items_quantity_delivered_check" CHECK ("delivery_receipt_items"."quantity_delivered" > 0)
);
--> statement-breakpoint
CREATE TABLE "delivery_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"delivery_date" timestamp with time zone DEFAULT now() NOT NULL,
	"receipt_number" varchar(100) NOT NULL,
	"received_by" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_receipts_receipt_number_key" UNIQUE("receipt_number")
);
--> statement-breakpoint
CREATE TABLE "delivery_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"scheduled_date" date NOT NULL,
	"status" "delivery_schedule_status_enum" DEFAULT 'Scheduled' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wholesale_clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_name" varchar(255) NOT NULL,
	"contact_person" varchar(255),
	"contact_number" varchar(50),
	"email" varchar(255),
	"address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wholesale_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" numeric(12, 2) NOT NULL,
	"line_total" numeric(12, 2) NOT NULL,
	CONSTRAINT "wholesale_order_items_quantity_check" CHECK ("wholesale_order_items"."quantity" > 0),
	CONSTRAINT "wholesale_order_items_unit_price_check" CHECK ("wholesale_order_items"."unit_price" >= 0),
	CONSTRAINT "wholesale_order_items_line_total_check" CHECK ("wholesale_order_items"."line_total" >= 0)
);
--> statement-breakpoint
CREATE TABLE "wholesale_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"contract_id" uuid,
	"order_date" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "wholesale_order_status_enum" DEFAULT 'Pending' NOT NULL,
	"total_order_amount" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wholesale_orders_total_order_amount_check" CHECK ("wholesale_orders"."total_order_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "cash_reconciliations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reconciliation_date" date NOT NULL,
	"cashier_id" uuid,
	"cash_on_hand" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"total_reported_sales" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"discrepancy_amount" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"has_flagged_inconsistency" boolean DEFAULT false NOT NULL,
	"notes" text,
	"reconciled_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dashboards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dashboards_user_id_key" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_type" varchar(100) NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"date_from" date NOT NULL,
	"date_to" date NOT NULL,
	"generated_by_user_id" uuid,
	"summary_data" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "backup_records" ADD CONSTRAINT "backup_records_initiated_by_user_id_users_id_fk" FOREIGN KEY ("initiated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_logs" ADD CONSTRAINT "system_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_activities" ADD CONSTRAINT "user_activities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_info" ADD CONSTRAINT "batch_info_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_alerts" ADD CONSTRAINT "inventory_alerts_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_alerts" ADD CONSTRAINT "inventory_alerts_batch_id_batch_info_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batch_info"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_batch_id_batch_info_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batch_info"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_items" ADD CONSTRAINT "transaction_items_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_items" ADD CONSTRAINT "transaction_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_items" ADD CONSTRAINT "transaction_items_batch_id_batch_info_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batch_info"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_cashier_id_users_id_fk" FOREIGN KEY ("cashier_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts_payable" ADD CONSTRAINT "accounts_payable_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts_payable" ADD CONSTRAINT "accounts_payable_invoice_id_supplier_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."supplier_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_items" ADD CONSTRAINT "delivery_items_delivery_id_supplier_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."supplier_deliveries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_items" ADD CONSTRAINT "delivery_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "po_items" ADD CONSTRAINT "po_items_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "po_items" ADD CONSTRAINT "po_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_deliveries" ADD CONSTRAINT "supplier_deliveries_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_ap_id_accounts_payable_id_fk" FOREIGN KEY ("ap_id") REFERENCES "public"."accounts_payable"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts_receivable" ADD CONSTRAINT "accounts_receivable_client_id_wholesale_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."wholesale_clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts_receivable" ADD CONSTRAINT "accounts_receivable_order_id_wholesale_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."wholesale_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ar_payments" ADD CONSTRAINT "ar_payments_ar_id_accounts_receivable_id_fk" FOREIGN KEY ("ar_id") REFERENCES "public"."accounts_receivable"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_contract_items" ADD CONSTRAINT "client_contract_items_contract_id_client_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."client_contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_contract_items" ADD CONSTRAINT "client_contract_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_contracts" ADD CONSTRAINT "client_contracts_client_id_wholesale_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."wholesale_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_receipt_items" ADD CONSTRAINT "delivery_receipt_items_receipt_id_delivery_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."delivery_receipts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_receipt_items" ADD CONSTRAINT "delivery_receipt_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_receipts" ADD CONSTRAINT "delivery_receipts_order_id_wholesale_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."wholesale_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_schedules" ADD CONSTRAINT "delivery_schedules_order_id_wholesale_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."wholesale_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wholesale_order_items" ADD CONSTRAINT "wholesale_order_items_order_id_wholesale_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."wholesale_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wholesale_order_items" ADD CONSTRAINT "wholesale_order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wholesale_orders" ADD CONSTRAINT "wholesale_orders_client_id_wholesale_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."wholesale_clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wholesale_orders" ADD CONSTRAINT "wholesale_orders_contract_id_client_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."client_contracts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_reconciliations" ADD CONSTRAINT "cash_reconciliations_cashier_id_users_id_fk" FOREIGN KEY ("cashier_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboards" ADD CONSTRAINT "dashboards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_generated_by_user_id_users_id_fk" FOREIGN KEY ("generated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_system_logs_user_id" ON "system_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_system_logs_module" ON "system_logs" USING btree ("module");--> statement-breakpoint
CREATE INDEX "idx_system_logs_timestamp" ON "system_logs" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "idx_user_activities_user_id" ON "user_activities" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_activities_module" ON "user_activities" USING btree ("module");--> statement-breakpoint
CREATE INDEX "idx_user_activities_flag" ON "user_activities" USING btree ("flag");--> statement-breakpoint
CREATE INDEX "idx_user_activities_timestamp" ON "user_activities" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "idx_batch_info_product_id" ON "batch_info" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_batch_info_expiration_date" ON "batch_info" USING btree ("expiration_date");--> statement-breakpoint
CREATE INDEX "idx_inventory_alerts_product_id" ON "inventory_alerts" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_inventory_alerts_is_resolved" ON "inventory_alerts" USING btree ("is_resolved");--> statement-breakpoint
CREATE INDEX "idx_products_category" ON "products" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_products_generic_name" ON "products" USING btree ("generic_name");--> statement-breakpoint
CREATE INDEX "idx_stock_movements_product_id" ON "stock_movements" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_stock_movements_batch_id" ON "stock_movements" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "idx_stock_movements_movement_date" ON "stock_movements" USING btree ("movement_date");--> statement-breakpoint
CREATE INDEX "idx_discounts_transaction_id" ON "discounts" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "idx_transaction_items_transaction_id" ON "transaction_items" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "idx_transaction_items_product_id" ON "transaction_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_transactions_cashier_id" ON "transactions" USING btree ("cashier_id");--> statement-breakpoint
CREATE INDEX "idx_transactions_customer_id" ON "transactions" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "idx_transactions_date" ON "transactions" USING btree ("transaction_date");--> statement-breakpoint
CREATE INDEX "idx_transactions_status" ON "transactions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_accounts_payable_supplier_id" ON "accounts_payable" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "idx_accounts_payable_invoice_id" ON "accounts_payable" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "idx_delivery_items_delivery_id" ON "delivery_items" USING btree ("delivery_id");--> statement-breakpoint
CREATE INDEX "idx_po_items_po_id" ON "po_items" USING btree ("po_id");--> statement-breakpoint
CREATE INDEX "idx_purchase_orders_supplier_id" ON "purchase_orders" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "idx_purchase_orders_status" ON "purchase_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_supplier_deliveries_po_id" ON "supplier_deliveries" USING btree ("po_id");--> statement-breakpoint
CREATE INDEX "idx_supplier_invoices_supplier_id" ON "supplier_invoices" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "idx_supplier_invoices_po_id" ON "supplier_invoices" USING btree ("po_id");--> statement-breakpoint
CREATE INDEX "idx_supplier_payments_ap_id" ON "supplier_payments" USING btree ("ap_id");--> statement-breakpoint
CREATE INDEX "idx_accounts_receivable_client_id" ON "accounts_receivable" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_accounts_receivable_order_id" ON "accounts_receivable" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_ar_payments_ar_id" ON "ar_payments" USING btree ("ar_id");--> statement-breakpoint
CREATE INDEX "idx_client_contracts_client_id" ON "client_contracts" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_delivery_receipts_order_id" ON "delivery_receipts" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_delivery_schedules_order_id" ON "delivery_schedules" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_wholesale_order_items_order_id" ON "wholesale_order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_wholesale_orders_client_id" ON "wholesale_orders" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_wholesale_orders_status" ON "wholesale_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_cash_reconciliations_date" ON "cash_reconciliations" USING btree ("reconciliation_date");--> statement-breakpoint
CREATE INDEX "idx_reports_report_type" ON "reports" USING btree ("report_type");--> statement-breakpoint
CREATE INDEX "idx_reports_date_range" ON "reports" USING btree ("date_from","date_to");