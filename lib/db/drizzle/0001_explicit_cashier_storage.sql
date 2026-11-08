-- Reproduce existing cashier storage explicitly; introduces no new business fields.
-- Existing definitions are verified by the migration runner before commit.
CREATE TABLE IF NOT EXISTS "cashier_payment_migrations" (
  "name" text NOT NULL,
  CONSTRAINT "cashier_payment_migrations_pkey" PRIMARY KEY (name)
);
CREATE TABLE IF NOT EXISTS "cashier_system_logs" (
  "id" SERIAL NOT NULL,
  "date_time" character varying(100) NOT NULL,
  "user_name" character varying(150) NOT NULL,
  "role" character varying(50) NOT NULL,
  "action" character varying(100) NOT NULL,
  "module" character varying(100) NOT NULL,
  "description" text NOT NULL,
  "status" character varying(50) DEFAULT 'Success'::character varying NOT NULL,
  "device_ip" character varying(50) DEFAULT '127.0.0.1'::character varying NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "cashier_system_logs_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS "cashier_transactions" (
  "id" SERIAL NOT NULL,
  "transaction_number" character varying(100) NOT NULL,
  "date_time" character varying(100) NOT NULL,
  "user_name" character varying(150) NOT NULL,
  "business_type" character varying(50) DEFAULT 'Retail'::character varying NOT NULL,
  "customer" character varying(150) DEFAULT 'Walk-in Customer'::character varying NOT NULL,
  "total" character varying(50) NOT NULL,
  "subtotal" character varying(50) NOT NULL,
  "discount" character varying(50) DEFAULT '₱0.00'::character varying NOT NULL,
  "vat" character varying(50) DEFAULT '₱0.00'::character varying NOT NULL,
  "amount_received" character varying(50) DEFAULT '₱0.00'::character varying NOT NULL,
  "change" character varying(50) DEFAULT '₱0.00'::character varying NOT NULL,
  "payment" character varying(50) DEFAULT 'Cash'::character varying NOT NULL,
  "status" character varying(50) DEFAULT 'Completed'::character varying NOT NULL,
  "items" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "legacy_transaction_number" character varying(100),
  "checkout_request_key" text,
  "checkout_payload" jsonb,
  CONSTRAINT "cashier_transactions_pkey" PRIMARY KEY (id),
  CONSTRAINT "cashier_transactions_transaction_number_key" UNIQUE (transaction_number)
);
CREATE TABLE IF NOT EXISTS "cashier_user_activities" (
  "id" SERIAL NOT NULL,
  "date_time" character varying(100) NOT NULL,
  "user_name" character varying(150) NOT NULL,
  "role" character varying(50) NOT NULL,
  "activity" character varying(150) NOT NULL,
  "module" character varying(100) NOT NULL,
  "description" text NOT NULL,
  "flag" character varying(50) DEFAULT 'Normal'::character varying NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "cashier_user_activities_pkey" PRIMARY KEY (id)
);
CREATE UNIQUE INDEX IF NOT EXISTS cashier_checkout_request_key_idx ON public.cashier_transactions USING btree (checkout_request_key);
