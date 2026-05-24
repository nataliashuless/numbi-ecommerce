-- Add siigo_payment_methods column to store user's configured payment methods
-- Format: JSON array of {id: number, name: string}
ALTER TABLE user_integrations ADD COLUMN IF NOT EXISTS siigo_payment_methods JSONB DEFAULT '[]'::jsonb;
