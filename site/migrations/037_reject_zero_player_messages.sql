WITH invalid_message_totals AS (
  UPDATE player_activity
  SET observed_message_count = NULL
  WHERE observed_message_count = 0
  RETURNING username, player_uuid
)
DELETE FROM player_info_observation_state observation
USING invalid_message_totals invalid
WHERE observation.metric = 'messages'
  AND (
    observation.identity_key = 'name:' || LOWER(invalid.username)
    OR (
      invalid.player_uuid IS NOT NULL
      AND observation.identity_key = 'uuid:' || LOWER(invalid.player_uuid::text)
    )
  );
