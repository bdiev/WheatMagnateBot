CREATE TABLE IF NOT EXISTS player_cape_history (
  id BIGSERIAL PRIMARY KEY,
  player_uuid UUID NOT NULL,
  cape_hash VARCHAR(128) NOT NULL,
  cape_url TEXT NOT NULL,
  first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (player_uuid, cape_hash)
);

INSERT INTO player_cape_history(player_uuid,cape_hash,cape_url,first_seen,last_seen)
SELECT player_uuid,cape_hash,MAX(cape_url),MIN(first_seen),MAX(last_seen)
FROM player_skin_history
WHERE cape_hash IS NOT NULL AND cape_url IS NOT NULL
GROUP BY player_uuid,cape_hash
ON CONFLICT(player_uuid,cape_hash) DO UPDATE SET
  cape_url=EXCLUDED.cape_url,
  first_seen=LEAST(player_cape_history.first_seen,EXCLUDED.first_seen),
  last_seen=GREATEST(player_cape_history.last_seen,EXCLUDED.last_seen);

CREATE INDEX IF NOT EXISTS player_cape_history_player_recent_idx
  ON player_cape_history(player_uuid,last_seen DESC,id DESC);
