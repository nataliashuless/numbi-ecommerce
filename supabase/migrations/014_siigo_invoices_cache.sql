-- Migration 014: persistent cache of Siigo invoices
-- Siigo invoices are immutable once issued, so we can cache them safely
-- and avoid hitting the API for every page load.

CREATE TABLE IF NOT EXISTS siigo_invoices (
  id UUID PRIMARY KEY,
  number INTEGER,
  prefix VARCHAR,
  name VARCHAR,
  date DATE NOT NULL,
  total NUMERIC,
  balance NUMERIC,
  customer_id UUID,
  customer_identification VARCHAR,
  observations TEXT,
  items JSONB,
  raw JSONB,
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_siigo_invoices_date ON siigo_invoices(date DESC);
CREATE INDEX IF NOT EXISTS idx_siigo_invoices_customer_id ON siigo_invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_siigo_invoices_customer_identification ON siigo_invoices(customer_identification);

ALTER TABLE siigo_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON siigo_invoices
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Last sync state per range (so we know what's already cached)
CREATE TABLE IF NOT EXISTS siigo_invoices_sync_state (
  id INTEGER PRIMARY KEY DEFAULT 1,
  earliest_date DATE,
  latest_date DATE,
  last_full_sync_at TIMESTAMP WITH TIME ZONE,
  CHECK (id = 1)
);
INSERT INTO siigo_invoices_sync_state (id) VALUES (1) ON CONFLICT DO NOTHING;

ALTER TABLE siigo_invoices_sync_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON siigo_invoices_sync_state
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
