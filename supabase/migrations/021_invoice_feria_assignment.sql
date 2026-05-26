-- Migration 021: manual invoice → feria assignment
-- Allows tagging specific Siigo invoices to a feria, overriding the
-- date-window heuristic used in the consolidated dashboard.

ALTER TABLE siigo_invoices
  ADD COLUMN IF NOT EXISTS assigned_feria_id UUID REFERENCES ferias(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_siigo_invoices_assigned_feria
  ON siigo_invoices(assigned_feria_id)
  WHERE assigned_feria_id IS NOT NULL;
