ALTER TABLE player_playtime
  ADD COLUMN IF NOT EXISTS player_uuid UUID;

ALTER TABLE game_chat_messages
  ADD COLUMN IF NOT EXISTS player_uuid UUID;

UPDATE player_playtime pt
SET player_uuid = pa.player_uuid
FROM player_activity pa
WHERE pt.player_uuid IS NULL
  AND pa.player_uuid IS NOT NULL
  AND LOWER(pa.username) = LOWER(pt.username);

WITH unambiguous_names AS (
  SELECT LOWER(username) AS username_key, MIN(player_uuid::text)::uuid AS player_uuid
  FROM player_name_history
  GROUP BY LOWER(username)
  HAVING COUNT(DISTINCT player_uuid) = 1
)
UPDATE player_playtime pt
SET player_uuid = names.player_uuid
FROM unambiguous_names names
WHERE pt.player_uuid IS NULL
  AND LOWER(pt.username) = names.username_key;

CREATE TEMP TABLE merged_uuid_playtime ON COMMIT DROP AS
SELECT
  pt.player_uuid,
  COALESCE(pa.username, MAX(pt.username)) AS username,
  SUM(pt.total_seconds)::BIGINT AS total_seconds,
  MIN(pt.tracking_since) FILTER (WHERE pt.tracking_since IS NOT NULL) AS tracking_since,
  MAX(pt.updated_at) AS updated_at
FROM player_playtime pt
LEFT JOIN player_activity pa ON pa.player_uuid = pt.player_uuid
WHERE pt.player_uuid IS NOT NULL
GROUP BY pt.player_uuid, pa.username;

DELETE FROM player_playtime WHERE player_uuid IS NOT NULL;

INSERT INTO player_playtime (username, player_uuid, total_seconds, tracking_since, updated_at)
SELECT username, player_uuid, total_seconds, tracking_since, updated_at
FROM merged_uuid_playtime
ON CONFLICT (LOWER(username)) DO UPDATE
SET player_uuid = EXCLUDED.player_uuid,
    total_seconds = player_playtime.total_seconds + EXCLUDED.total_seconds,
    tracking_since = COALESCE(player_playtime.tracking_since, EXCLUDED.tracking_since),
    updated_at = GREATEST(player_playtime.updated_at, EXCLUDED.updated_at);

CREATE UNIQUE INDEX IF NOT EXISTS player_playtime_uuid_unique_idx
  ON player_playtime (player_uuid)
  WHERE player_uuid IS NOT NULL;

CREATE INDEX IF NOT EXISTS game_chat_messages_player_uuid_created_idx
  ON game_chat_messages (player_uuid, created_at DESC)
  WHERE player_uuid IS NOT NULL;

UPDATE game_chat_messages messages
SET player_uuid = pa.player_uuid
FROM player_activity pa
WHERE messages.player_uuid IS NULL
  AND pa.player_uuid IS NOT NULL
  AND LOWER(pa.username) = LOWER(messages.username);

WITH unambiguous_names AS (
  SELECT LOWER(username) AS username_key, MIN(player_uuid::text)::uuid AS player_uuid
  FROM player_name_history
  GROUP BY LOWER(username)
  HAVING COUNT(DISTINCT player_uuid) = 1
)
UPDATE game_chat_messages messages
SET player_uuid = names.player_uuid
FROM unambiguous_names names
WHERE messages.player_uuid IS NULL
  AND LOWER(messages.username) = names.username_key;
