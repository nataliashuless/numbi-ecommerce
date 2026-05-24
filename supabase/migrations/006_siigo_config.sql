-- Migration: Add per-tenant Siigo configuration columns
-- Run this in Supabase SQL Editor

-- Add Siigo configuration columns to user_integrations
ALTER TABLE user_integrations ADD COLUMN IF NOT EXISTS siigo_cost_center_id INTEGER;
ALTER TABLE user_integrations ADD COLUMN IF NOT EXISTS siigo_cost_center_name TEXT;
ALTER TABLE user_integrations ADD COLUMN IF NOT EXISTS siigo_seller_id INTEGER;
ALTER TABLE user_integrations ADD COLUMN IF NOT EXISTS siigo_seller_name TEXT;
ALTER TABLE user_integrations ADD COLUMN IF NOT EXISTS siigo_iva_tax_id INTEGER DEFAULT 3559;
ALTER TABLE user_integrations ADD COLUMN IF NOT EXISTS siigo_default_document_id INTEGER;
ALTER TABLE user_integrations ADD COLUMN IF NOT EXISTS siigo_default_document_name TEXT;

-- Comments for documentation
COMMENT ON COLUMN user_integrations.siigo_cost_center_id IS 'ID del centro de costo en Siigo';
COMMENT ON COLUMN user_integrations.siigo_cost_center_name IS 'Nombre del centro de costo para referencia';
COMMENT ON COLUMN user_integrations.siigo_seller_id IS 'ID del vendedor en Siigo';
COMMENT ON COLUMN user_integrations.siigo_seller_name IS 'Nombre del vendedor para referencia';
COMMENT ON COLUMN user_integrations.siigo_iva_tax_id IS 'ID del impuesto IVA en Siigo (default: 3559 = IVA 19%)';
COMMENT ON COLUMN user_integrations.siigo_default_document_id IS 'ID del tipo de documento de factura por defecto';
COMMENT ON COLUMN user_integrations.siigo_default_document_name IS 'Nombre del tipo de documento para referencia';
