-- Older player-list synchronization treated the rendered TAB display value as
-- a Minecraft username. Numeric score/ping values therefore became empty
-- player_activity profiles. Remove only numeric, UUID-less rows that have no
-- player-owned data in any other source.
DELETE FROM player_activity activity
WHERE activity.player_uuid IS NULL
  AND activity.username ~ '^[0-9]+$'
  AND NOT EXISTS (
    SELECT 1 FROM whitelist entry
    WHERE LOWER(entry.username) = LOWER(activity.username)
  )
  AND NOT EXISTS (
    SELECT 1 FROM player_playtime playtime
    WHERE LOWER(playtime.username) = LOWER(activity.username)
  )
  AND NOT EXISTS (
    SELECT 1 FROM game_chat_messages message
    WHERE LOWER(message.username) = LOWER(activity.username)
  )
  AND NOT EXISTS (
    SELECT 1 FROM nearby_player_sightings sighting
    WHERE LOWER(sighting.username) = LOWER(activity.username)
  );
