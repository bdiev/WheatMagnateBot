-- Player cards query these tables by a case-insensitive username and then
-- immediately order or aggregate by time. Cover those access paths so a card
-- does not fall back to scanning whole tables as history grows.
CREATE INDEX IF NOT EXISTS game_chat_messages_player_uuid_profile_idx
  ON game_chat_messages (player_uuid, created_at DESC, id DESC)
  INCLUDE (message_count)
  WHERE player_uuid IS NOT NULL;

CREATE INDEX IF NOT EXISTS game_chat_messages_legacy_username_profile_idx
  ON game_chat_messages (LOWER(username), created_at DESC, id DESC)
  INCLUDE (message_count)
  WHERE player_uuid IS NULL;

CREATE INDEX IF NOT EXISTS nearby_player_sightings_username_seen_idx
  ON nearby_player_sightings (LOWER(username), last_seen DESC)
  INCLUDE (distance);

CREATE INDEX IF NOT EXISTS ignored_users_username_lower_idx
  ON ignored_users (LOWER(username));

CREATE INDEX IF NOT EXISTS whitelist_username_lower_idx
  ON whitelist (LOWER(username));

CREATE INDEX IF NOT EXISTS bot_accounts_username_active_idx
  ON bot_accounts (LOWER(username))
  WHERE deleted_at IS NULL;
