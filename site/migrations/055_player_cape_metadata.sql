ALTER TABLE player_cape_history
  ADD COLUMN IF NOT EXISTS cape_name VARCHAR(128),
  ADD COLUMN IF NOT EXISTS cape_source VARCHAR(32) NOT NULL DEFAULT 'mojang';

CREATE INDEX IF NOT EXISTS player_cape_history_source_idx
  ON player_cape_history(player_uuid,cape_source,last_seen DESC);
