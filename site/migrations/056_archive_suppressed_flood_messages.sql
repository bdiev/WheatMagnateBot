-- Flood summaries remain visible operational notices, but suppressed messages
-- are now archived individually in player profiles and carry the statistics.
-- Permit a zero weight so a summary does not double-count those messages.
ALTER TABLE game_chat_messages
  DROP CONSTRAINT IF EXISTS game_chat_messages_message_count_check;

ALTER TABLE game_chat_messages
  ADD CONSTRAINT game_chat_messages_message_count_check CHECK (message_count >= 0);
