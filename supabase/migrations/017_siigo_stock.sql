-- Migration 017: cache Siigo product stock per warehouse
-- Siigo exposes per-warehouse balances via GET /v1/products?include=stock
-- so we can finally show inventory consigned in each mayorista tienda.

CREATE TABLE IF NOT EXISTS siigo_warehouses (
  id INTEGER PRIMARY KEY,
  name VARCHAR,
  active BOOLEAN DEFAULT true,
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE siigo_warehouses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON siigo_warehouses
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE TABLE IF NOT EXISTS siigo_product_stock (
  product_id UUID NOT NULL,
  warehouse_id INTEGER NOT NULL,
  product_code VARCHAR,
  product_name VARCHAR,
  warehouse_name VARCHAR,
  quantity NUMERIC NOT NULL DEFAULT 0,
  available_total NUMERIC,
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (product_id, warehouse_id)
);

CREATE INDEX IF NOT EXISTS idx_siigo_product_stock_warehouse ON siigo_product_stock(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_siigo_product_stock_code ON siigo_product_stock(product_code);

ALTER TABLE siigo_product_stock ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON siigo_product_stock
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Link tienda → Siigo warehouse so we know which warehouse holds its consigned stock
ALTER TABLE tiendas_terceros
  ADD COLUMN IF NOT EXISTS siigo_warehouse_id INTEGER;

CREATE TABLE IF NOT EXISTS siigo_stock_sync_state (
  id INTEGER PRIMARY KEY DEFAULT 1,
  last_full_sync_at TIMESTAMP WITH TIME ZONE,
  products_synced INTEGER DEFAULT 0,
  CHECK (id = 1)
);
INSERT INTO siigo_stock_sync_state (id) VALUES (1) ON CONFLICT DO NOTHING;
ALTER TABLE siigo_stock_sync_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON siigo_stock_sync_state
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
