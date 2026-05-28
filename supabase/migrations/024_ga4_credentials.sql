-- Migration 024: Google Analytics 4 credentials
-- Used as the replacement for Shopify's removed shopifyqlQuery, to fetch
-- real visits / sessions / conversion rate from GA4.

ALTER TABLE user_integrations ADD COLUMN IF NOT EXISTS ga4_property_id VARCHAR;
ALTER TABLE user_integrations ADD COLUMN IF NOT EXISTS ga4_service_account_json TEXT;
