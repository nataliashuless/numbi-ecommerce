-- Executive Marketing dashboard: credentials, configurable objectives and annotations.
-- Apply manually in Supabase SQL Editor before configuring Meta/GA4 or saving settings.

ALTER TABLE user_integrations ADD COLUMN IF NOT EXISTS meta_access_token VARCHAR;
ALTER TABLE user_integrations ADD COLUMN IF NOT EXISTS meta_ad_account_id VARCHAR;
ALTER TABLE user_integrations ADD COLUMN IF NOT EXISTS meta_token_expires_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE user_integrations ADD COLUMN IF NOT EXISTS ga4_property_id VARCHAR;
ALTER TABLE user_integrations ADD COLUMN IF NOT EXISTS ga4_service_account_json TEXT;

CREATE TABLE IF NOT EXISTS marketing_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  objectives JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CHECK (id = 1)
);

INSERT INTO marketing_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE marketing_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated full access" ON marketing_settings;
CREATE POLICY "Authenticated full access" ON marketing_settings
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE TABLE IF NOT EXISTS marketing_annotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  annotation_date DATE NOT NULL,
  type VARCHAR NOT NULL CHECK (type IN (
    'promocion',
    'descuento',
    'lanzamiento',
    'precio',
    'coleccion',
    'campana',
    'web',
    'inventario',
    'otro'
  )),
  title VARCHAR NOT NULL,
  detail TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketing_annotations_date
  ON marketing_annotations(annotation_date DESC);

ALTER TABLE marketing_annotations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated full access" ON marketing_annotations;
CREATE POLICY "Authenticated full access" ON marketing_annotations
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
