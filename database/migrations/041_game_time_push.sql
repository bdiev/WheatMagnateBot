ALTER TABLE push_subscriptions
  ADD COLUMN IF NOT EXISTS game_time_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS game_time_minute SMALLINT NOT NULL DEFAULT 360
    CHECK (game_time_minute >= 0 AND game_time_minute < 1440),
  ADD COLUMN IF NOT EXISTS game_time_last_trigger_key BIGINT;

CREATE INDEX IF NOT EXISTS push_subscriptions_game_time_idx
  ON push_subscriptions(game_time_minute)
  WHERE enabled AND game_time_enabled;
