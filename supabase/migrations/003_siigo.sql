-- Migration: Add Siigo integration support
-- Run this in Supabase SQL Editor

-- Add Siigo credentials to user_integrations
ALTER TABLE user_integrations ADD COLUMN IF NOT EXISTS siigo_username VARCHAR;
ALTER TABLE user_integrations ADD COLUMN IF NOT EXISTS siigo_access_key VARCHAR;

-- Add invoice reference columns to ventas_whatsapp
ALTER TABLE ventas_whatsapp ADD COLUMN IF NOT EXISTS siigo_invoice_id VARCHAR;
ALTER TABLE ventas_whatsapp ADD COLUMN IF NOT EXISTS siigo_invoice_number VARCHAR;

-- Index for finding invoiced sales
CREATE INDEX IF NOT EXISTS idx_ventas_whatsapp_siigo_invoice
ON ventas_whatsapp(siigo_invoice_id)
WHERE siigo_invoice_id IS NOT NULL;
