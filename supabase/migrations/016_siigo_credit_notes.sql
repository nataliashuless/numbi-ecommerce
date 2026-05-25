-- Migration 016: cache Siigo credit notes (NC) to subtract from invoice totals
-- Without this, voided / partially-credited invoices keep inflating totals.

CREATE TABLE IF NOT EXISTS siigo_credit_notes (
  id UUID PRIMARY KEY,
  number INTEGER,
  prefix VARCHAR,
  name VARCHAR,
  date DATE NOT NULL,
  total NUMERIC,
  customer_id UUID,
  customer_identification VARCHAR,
  invoice_id UUID,
  invoice_name VARCHAR,
  observations TEXT,
  items JSONB,
  raw JSONB,
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_siigo_credit_notes_date ON siigo_credit_notes(date DESC);
CREATE INDEX IF NOT EXISTS idx_siigo_credit_notes_invoice_id ON siigo_credit_notes(invoice_id);

ALTER TABLE siigo_credit_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON siigo_credit_notes
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Accumulator on invoices: how much has been credited back via NCs.
ALTER TABLE siigo_invoices
  ADD COLUMN IF NOT EXISTS credited_amount NUMERIC NOT NULL DEFAULT 0;
