ALTER TABLE player_activity
  ADD COLUMN IF NOT EXISTS admin_notes TEXT;

ALTER TABLE player_activity
  ADD COLUMN IF NOT EXISTS admin_tags TEXT[] NOT NULL DEFAULT '{}'::text[];
