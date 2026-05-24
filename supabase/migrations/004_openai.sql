-- Add OpenAI API key to user_integrations
ALTER TABLE user_integrations ADD COLUMN IF NOT EXISTS openai_api_key VARCHAR;
