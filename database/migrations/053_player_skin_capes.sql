ALTER TABLE player_skin_history
  ADD COLUMN IF NOT EXISTS cape_hash VARCHAR(128),
  ADD COLUMN IF NOT EXISTS cape_url TEXT;

CREATE INDEX IF NOT EXISTS player_skin_history_cape_hash_idx
  ON player_skin_history(cape_hash)
  WHERE cape_hash IS NOT NULL;
