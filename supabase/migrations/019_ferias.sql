-- Migration 019: ferias / events table
-- A feria is a pop-up event where stock is taken to a venue for a few days.

CREATE TABLE IF NOT EXISTS ferias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre VARCHAR NOT NULL,
  ubicacion VARCHAR,
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE NOT NULL,
  siigo_warehouse_id INTEGER,
  notas TEXT,
  activa BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ferias_fechas ON ferias(fecha_inicio, fecha_fin);
CREATE INDEX IF NOT EXISTS idx_ferias_warehouse ON ferias(siigo_warehouse_id) WHERE siigo_warehouse_id IS NOT NULL;

ALTER TABLE ferias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON ferias
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
