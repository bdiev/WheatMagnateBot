-- Server announcements do not participate in player anti-flood. Remove the
-- legacy summaries created before server senders bypassed flood protection.
UPDATE game_chat_messages
SET is_visible = FALSE
WHERE LOWER(username) IN ('server', 'console')
  AND message ~ '^Skipped [0-9]+ (message|messages) due to chat flooding\.$';
