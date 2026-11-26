-- The Live Run timeline reads one mod's run: its last start, then its events and finds since.
CREATE INDEX IF NOT EXISTS area_explorer_events_token_time_idx ON area_explorer_events (token_id, occurred_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS area_explorer_finds_token_time_idx ON area_explorer_finds (token_id, found_at DESC, id DESC) WHERE removed_at IS NULL;
