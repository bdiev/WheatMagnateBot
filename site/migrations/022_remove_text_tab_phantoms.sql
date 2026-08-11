-- Numeric TAB phantoms were removed by migration 021. Rendered TAB labels can
-- also be textual (for example "BALANCE"), so remove every remaining
-- UUID-less activity row that has no player-owned evidence in another source.
-- A real player is recreated from a packet carrying their UUID when observed.
DELETE FROM player_activity activity
WHERE activity.player_uuid IS NULL
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
