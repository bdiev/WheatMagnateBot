-- Keep the last completed Player Stats payload across site restarts. Requests
-- can use this snapshot immediately while the expensive leaderboard query is
-- refreshed in the background.
CREATE TABLE IF NOT EXISTS site_player_stats_cache (
  id SMALLINT PRIMARY KEY CHECK (id = 1),
  payload JSONB NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
