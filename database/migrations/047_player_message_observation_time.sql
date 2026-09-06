ALTER TABLE player_activity
  ADD COLUMN IF NOT EXISTS observed_message_count_at TIMESTAMPTZ;

-- The imported total already includes older chat. Recover its snapshot time
-- before adding newer archive rows, without changing any stored totals.
WITH pending AS (
  SELECT id, username, player_uuid, observed_message_count
  FROM player_activity
  WHERE observed_message_count IS NOT NULL
    AND observed_message_count_at IS NULL
), names AS (
  SELECT id, username FROM pending
  UNION
  SELECT activity.id, history.username
  FROM pending activity
  JOIN player_name_history history ON history.player_uuid = activity.player_uuid
  WHERE NOT EXISTS (
    SELECT 1
    FROM player_name_history reused
    WHERE LOWER(reused.username) = LOWER(history.username)
      AND reused.player_uuid <> history.player_uuid
  )
), responses AS (
  SELECT response.created_at,
         REGEXP_MATCH(
           BTRIM(REGEXP_REPLACE(response.message, '§[0-9a-fk-or]', '', 'gi')),
           '^([A-Za-z0-9_]{1,32}):[[:space:]]+([0-9,]+)[[:space:]]+messages?[[:space:]]*[.!]?$',
           'i'
         ) AS parsed
  FROM game_chat_messages response
  WHERE LOWER(response.username) = 'lolritterbot'
    AND EXISTS (SELECT 1 FROM pending)
), response_anchors AS (
  SELECT names.id, MAX(response.created_at) AS observed_at
  FROM names
  JOIN pending activity ON activity.id = names.id
  JOIN responses response ON LOWER(response.parsed[1]) = LOWER(names.username)
    AND (activity.observed_message_count > 0 OR response.parsed[1] = names.username)
  -- Positive replies ignore name casing; zero requires the exact known casing.
  -- Compare normalized digits without casting potentially oversized chat text.
  WHERE COALESCE(NULLIF(LTRIM(REPLACE(response.parsed[2], ',', ''), '0'), ''), '0')
        = activity.observed_message_count::text
  GROUP BY names.id
), state_keys AS (
  SELECT id, 'uuid:' || LOWER(player_uuid::text) AS identity_key
  FROM pending
  WHERE player_uuid IS NOT NULL
  UNION
  SELECT id, 'name:' || LOWER(username) FROM names
), state_anchors AS (
  SELECT keys.id, MAX(observation.updated_at) AS observed_at
  FROM state_keys keys
  JOIN player_info_observation_state observation
    ON observation.identity_key = keys.identity_key
   AND observation.metric = 'messages'
   AND observation.imported = TRUE
  GROUP BY keys.id
)
UPDATE player_activity activity
SET observed_message_count_at = COALESCE(
  response.observed_at,
  observation.observed_at,
  NOW()
)
FROM pending
LEFT JOIN response_anchors response ON response.id = pending.id
LEFT JOIN state_anchors observation ON observation.id = pending.id
WHERE activity.id = pending.id
  AND activity.observed_message_count_at IS NULL;

-- State updates can be later than the import (for example a failed refresh).
-- With no archived response or imported state, start at migration time rather
-- than double-counting historical messages that may be in the imported total.
