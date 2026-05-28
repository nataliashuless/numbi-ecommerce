-- Migration 023: Meta (Facebook/Instagram) Marketing API credentials
-- Used to fetch ad campaign insights (spend, impressions, clicks, purchases)
-- and join them with Shopify orders for ROAS / CPA analytics.

ALTER TABLE user_integrations ADD COLUMN IF NOT EXISTS meta_access_token VARCHAR;
ALTER TABLE user_integrations ADD COLUMN IF NOT EXISTS meta_ad_account_id VARCHAR;
ALTER TABLE user_integrations ADD COLUMN IF NOT EXISTS meta_token_expires_at TIMESTAMP WITH TIME ZONE;
