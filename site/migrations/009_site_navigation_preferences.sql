CREATE TABLE IF NOT EXISTS site_navigation_preferences (
  user_id BIGINT PRIMARY KEY,
  visibility JSONB NOT NULL DEFAULT '{}'::JSONB,
  section_order TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF to_regclass('public.site_users') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='site_navigation_preferences_user_fk'
  ) THEN
    ALTER TABLE site_navigation_preferences ADD CONSTRAINT site_navigation_preferences_user_fk
      FOREIGN KEY(user_id) REFERENCES site_users(id) ON DELETE CASCADE;
  END IF;
END $$;
