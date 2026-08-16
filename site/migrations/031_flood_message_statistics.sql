ALTER TABLE game_chat_messages
  ADD COLUMN IF NOT EXISTS message_count INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_visible BOOLEAN NOT NULL DEFAULT TRUE;

-- Older flood summaries were stored as ordinary chat rows. Preserve their
-- statistical weight while keeping the system notice out of player history.
UPDATE game_chat_messages
SET message_count = SUBSTRING(message FROM '^Skipped ([0-9]+) ')::integer,
    is_visible = FALSE
WHERE message ~ '^Skipped [0-9]+ (message|messages) due to chat flooding\.$';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'game_chat_messages'::regclass
      AND conname = 'game_chat_messages_message_count_check'
  ) THEN
    ALTER TABLE game_chat_messages
      ADD CONSTRAINT game_chat_messages_message_count_check CHECK (message_count > 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS game_chat_messages_visible_created_idx
  ON game_chat_messages (created_at DESC, id DESC)
  WHERE is_visible = TRUE;
