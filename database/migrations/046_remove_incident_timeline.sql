CREATE TABLE IF NOT EXISTS player_session_events (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(255) NOT NULL,
  event_type VARCHAR(32) NOT NULL CHECK (event_type IN ('player_joined','player_left')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS player_session_events_identity_idx
  ON player_session_events (LOWER(username), event_type, occurred_at);
CREATE INDEX IF NOT EXISTS player_session_events_player_time_idx
  ON player_session_events (LOWER(username), occurred_at DESC, id DESC);

DO $$
BEGIN
  IF to_regclass('public.operational_events') IS NOT NULL
     AND to_regclass('public.operational_events_archive') IS NOT NULL THEN
    EXECUTE $migration$
      INSERT INTO player_session_events (username,event_type,occurred_at)
      SELECT source.username,source.event_type,source.occurred_at
      FROM (
        SELECT COALESCE(NULLIF(details->>'username', ''), actor, REGEXP_REPLACE(resource_key, '^player:', '')) AS username,event_type,occurred_at
        FROM operational_events
        WHERE source='player_activity' AND event_type IN ('player_joined','player_left')
        UNION ALL
        SELECT COALESCE(NULLIF(details->>'username', ''), actor, REGEXP_REPLACE(resource_key, '^player:', '')) AS username,event_type,occurred_at
        FROM operational_events_archive
        WHERE source='player_activity' AND event_type IN ('player_joined','player_left')
      ) source
      WHERE source.username IS NOT NULL AND source.username <> ''
      ON CONFLICT DO NOTHING
    $migration$;
  END IF;
END $$;

DROP TABLE IF EXISTS incident_events;
DROP TABLE IF EXISTS incidents;
DROP TABLE IF EXISTS operational_events_archive;
DROP TABLE IF EXISTS operational_events;

ALTER TABLE IF EXISTS bot_commands DROP COLUMN IF EXISTS correlation_id;
ALTER TABLE IF EXISTS notifications DROP COLUMN IF EXISTS correlation_id;
ALTER TABLE IF EXISTS obsidian_farm_annotations DROP COLUMN IF EXISTS correlation_id;
