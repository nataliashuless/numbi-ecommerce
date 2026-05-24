-- Migration: Enable Row Level Security (RLS) on all tables
-- Run this in Supabase SQL Editor

-- =============================================
-- 1. ENABLE RLS ON ALL TABLES
-- =============================================

ALTER TABLE tiendas_terceros ENABLE ROW LEVEL SECURITY;
ALTER TABLE ventas_whatsapp ENABLE ROW LEVEL SECURITY;
ALTER TABLE ventas_terceros ENABLE ROW LEVEL SECURITY;
ALTER TABLE consignaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE liquidaciones ENABLE ROW LEVEL SECURITY;

-- =============================================
-- 2. POLICIES FOR tiendas_terceros (direct user_id)
-- =============================================

CREATE POLICY "Users can view their own stores"
ON tiendas_terceros FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own stores"
ON tiendas_terceros FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own stores"
ON tiendas_terceros FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own stores"
ON tiendas_terceros FOR DELETE
USING (auth.uid() = user_id);

-- =============================================
-- 3. POLICIES FOR ventas_whatsapp (direct user_id)
-- =============================================

CREATE POLICY "Users can view their own whatsapp sales"
ON ventas_whatsapp FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own whatsapp sales"
ON ventas_whatsapp FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own whatsapp sales"
ON ventas_whatsapp FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own whatsapp sales"
ON ventas_whatsapp FOR DELETE
USING (auth.uid() = user_id);

-- =============================================
-- 4. POLICIES FOR ventas_terceros (via tienda_id)
-- =============================================

CREATE POLICY "Users can view sales from their stores"
ON ventas_terceros FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM tiendas_terceros
    WHERE tiendas_terceros.id = ventas_terceros.tienda_id
    AND tiendas_terceros.user_id = auth.uid()
  )
);

CREATE POLICY "Users can create sales for their stores"
ON ventas_terceros FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM tiendas_terceros
    WHERE tiendas_terceros.id = ventas_terceros.tienda_id
    AND tiendas_terceros.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update sales from their stores"
ON ventas_terceros FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM tiendas_terceros
    WHERE tiendas_terceros.id = ventas_terceros.tienda_id
    AND tiendas_terceros.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM tiendas_terceros
    WHERE tiendas_terceros.id = ventas_terceros.tienda_id
    AND tiendas_terceros.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete sales from their stores"
ON ventas_terceros FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM tiendas_terceros
    WHERE tiendas_terceros.id = ventas_terceros.tienda_id
    AND tiendas_terceros.user_id = auth.uid()
  )
);

-- =============================================
-- 5. POLICIES FOR consignaciones (via tienda_id)
-- =============================================

CREATE POLICY "Users can view consignments from their stores"
ON consignaciones FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM tiendas_terceros
    WHERE tiendas_terceros.id = consignaciones.tienda_id
    AND tiendas_terceros.user_id = auth.uid()
  )
);

CREATE POLICY "Users can create consignments for their stores"
ON consignaciones FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM tiendas_terceros
    WHERE tiendas_terceros.id = consignaciones.tienda_id
    AND tiendas_terceros.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update consignments from their stores"
ON consignaciones FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM tiendas_terceros
    WHERE tiendas_terceros.id = consignaciones.tienda_id
    AND tiendas_terceros.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM tiendas_terceros
    WHERE tiendas_terceros.id = consignaciones.tienda_id
    AND tiendas_terceros.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete consignments from their stores"
ON consignaciones FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM tiendas_terceros
    WHERE tiendas_terceros.id = consignaciones.tienda_id
    AND tiendas_terceros.user_id = auth.uid()
  )
);

-- =============================================
-- 6. POLICIES FOR liquidaciones (via tienda_id)
-- =============================================

CREATE POLICY "Users can view settlements from their stores"
ON liquidaciones FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM tiendas_terceros
    WHERE tiendas_terceros.id = liquidaciones.tienda_id
    AND tiendas_terceros.user_id = auth.uid()
  )
);

CREATE POLICY "Users can create settlements for their stores"
ON liquidaciones FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM tiendas_terceros
    WHERE tiendas_terceros.id = liquidaciones.tienda_id
    AND tiendas_terceros.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update settlements from their stores"
ON liquidaciones FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM tiendas_terceros
    WHERE tiendas_terceros.id = liquidaciones.tienda_id
    AND tiendas_terceros.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM tiendas_terceros
    WHERE tiendas_terceros.id = liquidaciones.tienda_id
    AND tiendas_terceros.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete settlements from their stores"
ON liquidaciones FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM tiendas_terceros
    WHERE tiendas_terceros.id = liquidaciones.tienda_id
    AND tiendas_terceros.user_id = auth.uid()
  )
);

-- =============================================
-- 7. SERVICE ROLE ACCESS (for backend operations)
-- =============================================
-- Note: Service role bypasses RLS by default in Supabase
-- No additional policies needed for backend/admin operations
