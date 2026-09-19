CREATE TABLE IF NOT EXISTS player_skin_history (
  id BIGSERIAL PRIMARY KEY,
  player_uuid UUID NOT NULL,
  texture_hash VARCHAR(128) NOT NULL,
  texture_url TEXT NOT NULL,
  model VARCHAR(16) NOT NULL DEFAULT 'classic' CHECK (model IN ('classic', 'slim')),
  first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (player_uuid, texture_hash)
);

CREATE INDEX IF NOT EXISTS player_skin_history_player_recent_idx
  ON player_skin_history(player_uuid, last_seen DESC, id DESC);
