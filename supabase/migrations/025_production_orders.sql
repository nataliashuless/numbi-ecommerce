-- Migration 025: production / purchase orders (zapatos en camino)
-- Lets us register orders placed with manufacturers so the demand forecast
-- can subtract units already in transit (not yet received into Siigo stock).

CREATE TABLE IF NOT EXISTS production_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero VARCHAR,                       -- e.g. "030"
  proveedor VARCHAR,                    -- e.g. "Críos Shoes SAS"
  fecha_creacion DATE,
  fecha_entrega DATE,                   -- expected arrival
  estado VARCHAR NOT NULL DEFAULT 'pendiente', -- pendiente | recibida | cancelada
  notas TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS production_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES production_orders(id) ON DELETE CASCADE,
  diseno VARCHAR NOT NULL,              -- design name, e.g. "Oso"
  talla VARCHAR,                        -- size, e.g. "23"
  cantidad INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_production_order_items_order ON production_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_production_orders_estado ON production_orders(estado);

ALTER TABLE production_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON production_orders
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

ALTER TABLE production_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON production_order_items
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
