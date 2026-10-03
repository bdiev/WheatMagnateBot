-- Per-day playtime slices for the Discord 7-day / 30-day leaderboards.
-- Keyed like player_playtime identities: the profile UUID when known,
-- otherwise the lower-case username. Days are UTC calendar days.
CREATE TABLE IF NOT EXISTS player_playtime_daily (
  identity_key TEXT NOT NULL,
  day DATE NOT NULL,
  seconds BIGINT NOT NULL DEFAULT 0 CHECK (seconds >= 0),
  PRIMARY KEY (identity_key, day)
);

CREATE INDEX IF NOT EXISTS player_playtime_daily_day_idx ON player_playtime_daily (day);
