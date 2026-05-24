-- Migration: Siigo configuration per source (WhatsApp and Tiendas)
-- Run this in Supabase SQL Editor

-- WhatsApp configuration in user_integrations
ALTER TABLE user_integrations
ADD COLUMN IF NOT EXISTS siigo_whatsapp_cost_center_id INTEGER,
ADD COLUMN IF NOT EXISTS siigo_whatsapp_cost_center_name TEXT,
ADD COLUMN IF NOT EXISTS siigo_whatsapp_seller_id INTEGER,
ADD COLUMN IF NOT EXISTS siigo_whatsapp_seller_name TEXT,
ADD COLUMN IF NOT EXISTS siigo_whatsapp_iva_tax_id INTEGER DEFAULT 3559,
ADD COLUMN IF NOT EXISTS siigo_whatsapp_default_document_id INTEGER,
ADD COLUMN IF NOT EXISTS siigo_whatsapp_default_document_name TEXT;

-- Tienda configuration in tiendas_terceros
ALTER TABLE tiendas_terceros
ADD COLUMN IF NOT EXISTS siigo_cost_center_id INTEGER,
ADD COLUMN IF NOT EXISTS siigo_cost_center_name TEXT,
ADD COLUMN IF NOT EXISTS siigo_seller_id INTEGER,
ADD COLUMN IF NOT EXISTS siigo_seller_name TEXT,
ADD COLUMN IF NOT EXISTS siigo_iva_tax_id INTEGER DEFAULT 3559,
ADD COLUMN IF NOT EXISTS siigo_default_document_id INTEGER,
ADD COLUMN IF NOT EXISTS siigo_default_document_name TEXT;

-- Migrate existing user config to WhatsApp config (one-time migration)
-- This preserves any existing configuration the user had set up
UPDATE user_integrations
SET siigo_whatsapp_cost_center_id = siigo_cost_center_id,
    siigo_whatsapp_cost_center_name = siigo_cost_center_name,
    siigo_whatsapp_seller_id = siigo_seller_id,
    siigo_whatsapp_seller_name = siigo_seller_name,
    siigo_whatsapp_iva_tax_id = COALESCE(siigo_iva_tax_id, 3559),
    siigo_whatsapp_default_document_id = siigo_default_document_id,
    siigo_whatsapp_default_document_name = siigo_default_document_name
WHERE siigo_cost_center_id IS NOT NULL
   OR siigo_seller_id IS NOT NULL
   OR siigo_iva_tax_id IS NOT NULL;

-- Comments for documentation
COMMENT ON COLUMN user_integrations.siigo_whatsapp_cost_center_id IS 'Centro de costo Siigo para ventas WhatsApp';
COMMENT ON COLUMN user_integrations.siigo_whatsapp_seller_id IS 'Vendedor Siigo para ventas WhatsApp';
COMMENT ON COLUMN user_integrations.siigo_whatsapp_iva_tax_id IS 'ID impuesto IVA Siigo para ventas WhatsApp';
COMMENT ON COLUMN tiendas_terceros.siigo_cost_center_id IS 'Centro de costo Siigo para esta tienda';
COMMENT ON COLUMN tiendas_terceros.siigo_seller_id IS 'Vendedor Siigo para esta tienda';
COMMENT ON COLUMN tiendas_terceros.siigo_iva_tax_id IS 'ID impuesto IVA Siigo para esta tienda';
