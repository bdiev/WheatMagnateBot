WITH restored AS (
  UPDATE player_activity activity
  SET observed_message_count = 0
  WHERE activity.observed_message_count IS NULL
    AND EXISTS (
      SELECT 1
      FROM game_chat_messages response
      WHERE LOWER(response.username) = 'lolritterbot'
        AND response.message IN (
          activity.username || ': 0 messages',
          activity.username || ': 0 messages.',
          activity.username || ': 0 message',
          activity.username || ': 0 message.'
        )
    )
  RETURNING activity.username, activity.player_uuid
), canonical AS (
  SELECT DISTINCT ON (identity_key)
         identity_key,
         username
  FROM (
    SELECT CASE
             WHEN player_uuid IS NOT NULL THEN 'uuid:' || LOWER(player_uuid::text)
             ELSE 'name:' || LOWER(username)
           END AS identity_key,
           username
    FROM restored
  ) candidates
  ORDER BY identity_key, username
)
INSERT INTO player_info_observation_state
  (metric, identity_key, username, imported, refresh_requested_at, updated_at)
SELECT 'messages', identity_key, username, TRUE, NULL, NOW()
FROM canonical
ON CONFLICT (metric, identity_key)
DO UPDATE SET username = EXCLUDED.username,
              imported = TRUE,
              refresh_requested_at = NULL,
              updated_at = NOW();
