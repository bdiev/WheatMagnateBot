CREATE TABLE IF NOT EXISTS player_info_observation_state (
  metric VARCHAR(16) NOT NULL CHECK (metric IN ('playtime', 'joinDate')),
  identity_key VARCHAR(80) NOT NULL,
  username VARCHAR(32) NOT NULL,
  imported BOOLEAN NOT NULL DEFAULT FALSE,
  refresh_requested_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (metric, identity_key)
);

CREATE INDEX IF NOT EXISTS player_info_observation_refresh_idx
  ON player_info_observation_state (refresh_requested_at)
  WHERE refresh_requested_at IS NOT NULL;
