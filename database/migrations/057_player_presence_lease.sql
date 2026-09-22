-- Presence is an observation lease, not durable state. Rows written before this
-- column existed cannot prove that their observer is still alive.
ALTER TABLE IF EXISTS player_activity
  ADD COLUMN IF NOT EXISTS presence_observed_at TIMESTAMPTZ;

INSERT INTO player_session_events(username,event_type,occurred_at)
SELECT username,'player_left',COALESCE(last_seen,last_online,NOW())
FROM player_activity
WHERE is_online = TRUE
  AND presence_observed_at IS NULL
ON CONFLICT DO NOTHING;

UPDATE player_activity
SET is_online = FALSE,
    online_since = NULL
WHERE is_online = TRUE
  AND presence_observed_at IS NULL;

-- A tracking timer from an old process must not keep increasing forever. The
-- next live snapshot starts it again for players who are actually online.
DO $$ BEGIN
  IF to_regclass('public.player_playtime') IS NOT NULL THEN
    UPDATE player_playtime
    SET tracking_since = NULL,
        updated_at = NOW()
    WHERE tracking_since IS NOT NULL;
  END IF;
END $$;
