CREATE TABLE IF NOT EXISTS player_info_lookup_exclusions (
  username_key VARCHAR(32) PRIMARY KEY CHECK (username_key = LOWER(username_key)),
  username VARCHAR(32) NOT NULL,
  reason VARCHAR(32) NOT NULL DEFAULT 'user_not_found'
    CHECK (reason IN ('user_not_found', 'join_date_null')),
  source VARCHAR(32) NOT NULL DEFAULT 'discord',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS player_info_lookup_exclusions_updated_idx
  ON player_info_lookup_exclusions (updated_at DESC);
