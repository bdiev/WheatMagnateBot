-- Historical last_online values may belong to a previous session.
-- Only observed join events can establish the current session's start.
ALTER TABLE IF EXISTS player_activity
  ADD COLUMN IF NOT EXISTS online_since TIMESTAMPTZ;
