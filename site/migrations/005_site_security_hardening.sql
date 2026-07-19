CREATE TABLE IF NOT EXISTS site_security_state (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF to_regclass('public.site_sessions') IS NOT NULL THEN
    ALTER TABLE site_sessions ADD COLUMN IF NOT EXISTS csrf_token_hash TEXT;
  END IF;
END $$;
