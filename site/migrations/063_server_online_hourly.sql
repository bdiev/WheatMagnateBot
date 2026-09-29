-- Direct TAB-list samples are the authoritative source for Average Server
-- Online. Session events can miss players who were already connected when the
-- bot joined, while sampled totals measure the value shown by the server.
CREATE TABLE IF NOT EXISTS server_online_hourly (
  bucket TIMESTAMPTZ PRIMARY KEY,
  sample_count BIGINT NOT NULL DEFAULT 0 CHECK (sample_count >= 0),
  player_sum BIGINT NOT NULL DEFAULT 0 CHECK (player_sum >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Recover the available history from the existing once-per-minute TAB ping
-- samples. MAX(sample_count) estimates the number of sampling rounds in an
-- hour; SUM(sample_count) is the number of observed non-bot player samples.
-- Add the observing bot once per round to match the live server-total card.
INSERT INTO server_online_hourly(bucket,sample_count,player_sum,updated_at)
SELECT hour_start,
       MAX(sample_count)::bigint,
       (SUM(sample_count) + MAX(sample_count))::bigint,
       NOW()
FROM player_ping_hourly
GROUP BY hour_start
ON CONFLICT(bucket) DO NOTHING;
