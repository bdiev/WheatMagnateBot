-- Tab-list latency is sampled periodically. Hourly aggregates keep the history
-- compact while still allowing averages, ranges and trends per player.
CREATE TABLE IF NOT EXISTS player_ping_hourly (
  username_key VARCHAR(32) NOT NULL,
  hour_start TIMESTAMPTZ NOT NULL,
  player_uuid UUID,
  sample_count INTEGER NOT NULL DEFAULT 0 CHECK (sample_count >= 0),
  ping_sum BIGINT NOT NULL DEFAULT 0 CHECK (ping_sum >= 0),
  ping_min INTEGER NOT NULL CHECK (ping_min >= 0),
  ping_max INTEGER NOT NULL CHECK (ping_max >= 0),
  PRIMARY KEY (username_key, hour_start)
);

CREATE INDEX IF NOT EXISTS player_ping_hourly_uuid_idx
  ON player_ping_hourly (player_uuid, hour_start DESC)
  WHERE player_uuid IS NOT NULL;

CREATE INDEX IF NOT EXISTS player_ping_hourly_hour_idx
  ON player_ping_hourly (hour_start);

ALTER TABLE IF EXISTS player_activity
  ADD COLUMN IF NOT EXISTS last_ping_ms INTEGER CHECK (last_ping_ms >= 0),
  ADD COLUMN IF NOT EXISTS last_ping_at TIMESTAMPTZ;
