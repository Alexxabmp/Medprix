CREATE TABLE wholesale_collections (
  id uuid PRIMARY KEY REFERENCES ar_payments(id) ON DELETE RESTRICT,
  collector_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  collector_name varchar(255) NOT NULL,
  method varchar(30) NOT NULL CHECK (method IN ('Cash','Bank transfer','GCash')),
  reference varchar(255),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((method='Cash' AND reference IS NULL) OR (method<>'Cash' AND reference IS NOT NULL AND length(btrim(reference)) BETWEEN 1 AND 255))
);
--> statement-breakpoint
CREATE TABLE wholesale_collection_reversals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id uuid NOT NULL UNIQUE REFERENCES wholesale_collections(id) ON DELETE RESTRICT,
  reversed_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 500),
  reversed_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX idx_wholesale_collections_collector ON wholesale_collections(collector_id,recorded_at);
--> statement-breakpoint
CREATE FUNCTION protect_wholesale_collection_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Wholesale collection history is immutable' USING ERRCODE='23514';
END $$;
--> statement-breakpoint
CREATE TRIGGER protect_wholesale_collections BEFORE UPDATE OR DELETE ON wholesale_collections
FOR EACH ROW EXECUTE FUNCTION protect_wholesale_collection_history();
CREATE TRIGGER protect_wholesale_reversals BEFORE UPDATE OR DELETE ON wholesale_collection_reversals
FOR EACH ROW EXECUTE FUNCTION protect_wholesale_collection_history();
--> statement-breakpoint
CREATE FUNCTION protect_wholesale_payment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM wholesale_collections WHERE id=OLD.id) THEN
    RAISE EXCEPTION 'Posted wholesale payment is immutable' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' THEN RETURN NEW; ELSE RETURN OLD; END IF;
END $$;
--> statement-breakpoint
CREATE TRIGGER protect_wholesale_payment BEFORE UPDATE OR DELETE ON ar_payments
FOR EACH ROW EXECUTE FUNCTION protect_wholesale_payment();
