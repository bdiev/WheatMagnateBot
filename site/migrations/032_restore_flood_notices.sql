-- Flood summaries are statistical rows, but they are also useful operational
-- notices in the live website chat. Restore summaries hidden by migration 031.
UPDATE game_chat_messages
SET is_visible = TRUE
WHERE message ~ '^Skipped [0-9]+ (message|messages) due to chat flooding\.$';
