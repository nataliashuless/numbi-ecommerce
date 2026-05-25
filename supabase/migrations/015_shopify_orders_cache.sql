-- Migration 015: persistent cache of Shopify orders
-- Same rationale as siigo_invoices: avoid hitting Shopify on every page
-- load and let us query 3+ years of history fast.

CREATE TABLE IF NOT EXISTS shopify_orders (
  id BIGINT PRIMARY KEY,
  order_number INTEGER,
  name VARCHAR,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL,
  total_price NUMERIC,
  currency VARCHAR,
  financial_status VARCHAR,
  fulfillment_status VARCHAR,
  customer_name VARCHAR,
  customer_email VARCHAR,
  item_count INTEGER,
  line_items JSONB,
  raw JSONB,
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shopify_orders_created_at ON shopify_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shopify_orders_order_number ON shopify_orders(order_number);

ALTER TABLE shopify_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON shopify_orders
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE TABLE IF NOT EXISTS shopify_orders_sync_state (
  id INTEGER PRIMARY KEY DEFAULT 1,
  earliest_at TIMESTAMP WITH TIME ZONE,
  latest_at TIMESTAMP WITH TIME ZONE,
  last_full_sync_at TIMESTAMP WITH TIME ZONE,
  CHECK (id = 1)
);
INSERT INTO shopify_orders_sync_state (id) VALUES (1) ON CONFLICT DO NOTHING;

ALTER TABLE shopify_orders_sync_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON shopify_orders_sync_state
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
