UPDATE player_activity activity
SET registration_at = NULL
WHERE activity.registration_at IS NOT NULL
  AND activity.last_seen IS NOT NULL
  AND activity.registration_at > activity.last_seen
  AND NOT EXISTS (
    SELECT 1
    FROM player_info_observation_state observation
    WHERE observation.metric = 'joinDate'
      AND observation.imported = TRUE
      AND (
        observation.identity_key = 'name:' || LOWER(activity.username)
        OR (
          activity.player_uuid IS NOT NULL
          AND observation.identity_key = 'uuid:' || LOWER(activity.player_uuid::text)
        )
      )
  );
