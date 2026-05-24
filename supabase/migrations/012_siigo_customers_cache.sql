-- Migration 012: persistent cache of Siigo customer names
-- Avoid hitting Siigo /customers/{id} on every reconciliation request
-- (otherwise we trigger 429 rate limits)

CREATE TABLE IF NOT EXISTS siigo_customers (
  id UUID PRIMARY KEY,
  identification VARCHAR,
  name VARCHAR,
  last_synced TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_siigo_customers_identification
  ON siigo_customers(identification);

ALTER TABLE siigo_customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON siigo_customers
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
