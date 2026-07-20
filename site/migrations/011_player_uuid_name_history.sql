ALTER TABLE player_activity
  ADD COLUMN IF NOT EXISTS player_uuid UUID;

CREATE UNIQUE INDEX IF NOT EXISTS player_activity_uuid_unique_idx
  ON player_activity (player_uuid)
  WHERE player_uuid IS NOT NULL;

CREATE TABLE IF NOT EXISTS player_name_history (
  id BIGSERIAL PRIMARY KEY,
  player_uuid UUID NOT NULL,
  username VARCHAR(32) NOT NULL,
  first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS player_name_history_uuid_username_unique_idx
  ON player_name_history (player_uuid, LOWER(username));

CREATE INDEX IF NOT EXISTS player_name_history_username_lookup_idx
  ON player_name_history (LOWER(username));
