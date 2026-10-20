-- Area Explorer finds a site user starred: their own Favorites tab. One row per user and find;
-- both going takes the star with it.
CREATE TABLE IF NOT EXISTS area_explorer_favorites (
  user_id BIGINT NOT NULL,
  find_id BIGINT NOT NULL REFERENCES area_explorer_finds(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, find_id)
);

DO $$
BEGIN
  IF to_regclass('public.site_users') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'area_explorer_favorites_user_fk'
  ) THEN
    ALTER TABLE area_explorer_favorites ADD CONSTRAINT area_explorer_favorites_user_fk
      FOREIGN KEY (user_id) REFERENCES site_users(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS area_explorer_favorites_find_idx ON area_explorer_favorites (find_id);
