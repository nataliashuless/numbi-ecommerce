-- Migration: Add indexes for multi-tenant performance
-- Run this in Supabase SQL Editor

-- Index for filtering tiendas by user
CREATE INDEX IF NOT EXISTS idx_tiendas_terceros_user_id
ON tiendas_terceros(user_id);

-- Index for filtering ventas_terceros by tienda
CREATE INDEX IF NOT EXISTS idx_ventas_terceros_tienda_id
ON ventas_terceros(tienda_id);

-- Index for filtering ventas_terceros by liquidacion (for pending sales)
CREATE INDEX IF NOT EXISTS idx_ventas_terceros_liquidacion_id
ON ventas_terceros(liquidacion_id);

-- Index for filtering consignaciones by tienda
CREATE INDEX IF NOT EXISTS idx_consignaciones_tienda_id
ON consignaciones(tienda_id);

-- Index for filtering user_integrations by user
CREATE INDEX IF NOT EXISTS idx_user_integrations_user_id
ON user_integrations(user_id);

-- Index for filtering ventas_whatsapp by user
CREATE INDEX IF NOT EXISTS idx_ventas_whatsapp_user_id
ON ventas_whatsapp(user_id);

-- Index for filtering liquidaciones by tienda
CREATE INDEX IF NOT EXISTS idx_liquidaciones_tienda_id
ON liquidaciones(tienda_id);

-- Composite index for ventas_terceros queries that filter by tienda and date
CREATE INDEX IF NOT EXISTS idx_ventas_terceros_tienda_fecha
ON ventas_terceros(tienda_id, fecha);

-- Composite index for consignaciones queries that filter by tienda and sku
CREATE INDEX IF NOT EXISTS idx_consignaciones_tienda_sku
ON consignaciones(tienda_id, producto_sku);

-- Composite index for ventas_whatsapp queries that filter by user and date
CREATE INDEX IF NOT EXISTS idx_ventas_whatsapp_user_fecha
ON ventas_whatsapp(user_id, fecha);

-- Verify user_id column exists on tables that need it
-- (These ALTER TABLE statements will fail safely if columns already exist)

-- Add user_id to tiendas_terceros if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tiendas_terceros' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE tiendas_terceros ADD COLUMN user_id UUID REFERENCES auth.users(id);
  END IF;
END $$;

-- Add user_id to ventas_whatsapp if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ventas_whatsapp' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE ventas_whatsapp ADD COLUMN user_id UUID REFERENCES auth.users(id);
  END IF;
END $$;
