-- Migration 011: link tiendas_terceros with Siigo customers by identification (NIT/cedula)
-- Used by the reconciliation page to detect when a Siigo invoice belongs to a tienda mayorista.

ALTER TABLE tiendas_terceros
  ADD COLUMN IF NOT EXISTS siigo_customer_identification VARCHAR;

CREATE INDEX IF NOT EXISTS idx_tiendas_terceros_siigo_customer_identification
  ON tiendas_terceros(siigo_customer_identification)
  WHERE siigo_customer_identification IS NOT NULL;
