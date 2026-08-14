CREATE INDEX IF NOT EXISTS operational_events_player_session_resource_idx
  ON operational_events (LOWER(resource_key), occurred_at DESC, id DESC)
  WHERE source = 'player_activity'
    AND event_type IN ('player_joined', 'player_left');

CREATE INDEX IF NOT EXISTS operational_events_archive_player_session_resource_idx
  ON operational_events_archive (LOWER(resource_key), occurred_at DESC, id DESC)
  WHERE source = 'player_activity'
    AND event_type IN ('player_joined', 'player_left');
