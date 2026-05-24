-- Migration 010: Convert from multi-tenant to single-tenant (Shuless)
-- Removes user_id columns, FK constraints, and rewrites RLS so any
-- authenticated user can read/write all rows.

BEGIN;

-- 1. Drop all multi-tenant RLS policies
DROP POLICY IF EXISTS "Users can view their own stores" ON tiendas_terceros;
DROP POLICY IF EXISTS "Users can create their own stores" ON tiendas_terceros;
DROP POLICY IF EXISTS "Users can update their own stores" ON tiendas_terceros;
DROP POLICY IF EXISTS "Users can delete their own stores" ON tiendas_terceros;

DROP POLICY IF EXISTS "Users can view their own whatsapp sales" ON ventas_whatsapp;
DROP POLICY IF EXISTS "Users can create their own whatsapp sales" ON ventas_whatsapp;
DROP POLICY IF EXISTS "Users can update their own whatsapp sales" ON ventas_whatsapp;
DROP POLICY IF EXISTS "Users can delete their own whatsapp sales" ON ventas_whatsapp;

DROP POLICY IF EXISTS "Users can view sales for their stores" ON ventas_terceros;
DROP POLICY IF EXISTS "Users can view sales from their stores" ON ventas_terceros;
DROP POLICY IF EXISTS "Users can create sales for their stores" ON ventas_terceros;
DROP POLICY IF EXISTS "Users can update sales from their stores" ON ventas_terceros;
DROP POLICY IF EXISTS "Users can delete sales from their stores" ON ventas_terceros;

DROP POLICY IF EXISTS "Users can view consignments for their stores" ON consignaciones;
DROP POLICY IF EXISTS "Users can view consignments from their stores" ON consignaciones;
DROP POLICY IF EXISTS "Users can create consignments for their stores" ON consignaciones;
DROP POLICY IF EXISTS "Users can update consignments from their stores" ON consignaciones;
DROP POLICY IF EXISTS "Users can delete consignments from their stores" ON consignaciones;

DROP POLICY IF EXISTS "Users can view settlements for their stores" ON liquidaciones;
DROP POLICY IF EXISTS "Users can view settlements from their stores" ON liquidaciones;
DROP POLICY IF EXISTS "Users can create settlements for their stores" ON liquidaciones;
DROP POLICY IF EXISTS "Users can update settlements from their stores" ON liquidaciones;
DROP POLICY IF EXISTS "Users can delete settlements from their stores" ON liquidaciones;

DROP POLICY IF EXISTS "Users can manage own integrations" ON user_integrations;
DROP POLICY IF EXISTS "Allow insert integrations" ON user_integrations;

-- 2. Drop FK + UNIQUE constraints on user_id
ALTER TABLE tiendas_terceros  DROP CONSTRAINT IF EXISTS tiendas_terceros_user_id_fkey;
ALTER TABLE ventas_whatsapp   DROP CONSTRAINT IF EXISTS ventas_whatsapp_user_id_fkey;
ALTER TABLE user_integrations DROP CONSTRAINT IF EXISTS user_integrations_user_id_fkey;
ALTER TABLE user_integrations DROP CONSTRAINT IF EXISTS user_integrations_user_id_key;

-- 3. Drop user_id columns
ALTER TABLE tiendas_terceros  DROP COLUMN IF EXISTS user_id;
ALTER TABLE ventas_whatsapp   DROP COLUMN IF EXISTS user_id;
ALTER TABLE user_integrations DROP COLUMN IF EXISTS user_id;

-- 4. Drop user_id-related indexes
DROP INDEX IF EXISTS idx_tiendas_terceros_user_id;
DROP INDEX IF EXISTS idx_ventas_whatsapp_user_id;
DROP INDEX IF EXISTS idx_ventas_whatsapp_user_fecha;
DROP INDEX IF EXISTS idx_user_integrations_user_id;

-- 5. Recreate simplified indexes (no user_id)
CREATE INDEX IF NOT EXISTS idx_ventas_whatsapp_fecha ON ventas_whatsapp(fecha DESC);

-- 6. New permissive RLS policies: any authenticated user
CREATE POLICY "Authenticated full access" ON tiendas_terceros
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated full access" ON ventas_whatsapp
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated full access" ON ventas_terceros
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated full access" ON consignaciones
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated full access" ON liquidaciones
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated full access" ON user_integrations
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

COMMIT;
