CREATE INDEX IF NOT EXISTS game_chat_messages_legacy_username_created_idx
  ON game_chat_messages (LOWER(username), created_at DESC)
  WHERE player_uuid IS NULL;

CREATE INDEX IF NOT EXISTS player_activity_registration_at_idx
  ON player_activity (registration_at, id);
