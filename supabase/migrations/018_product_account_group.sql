-- Migration 018: track product account group so we can exclude
-- raw materials from inventory views.

ALTER TABLE siigo_product_stock
  ADD COLUMN IF NOT EXISTS account_group_id INTEGER,
  ADD COLUMN IF NOT EXISTS account_group_name VARCHAR;

CREATE INDEX IF NOT EXISTS idx_siigo_product_stock_account_group
  ON siigo_product_stock(account_group_id);
