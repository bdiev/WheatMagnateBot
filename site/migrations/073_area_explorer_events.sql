-- Area Explorer run log: what happened to the mod's runs - started, paused, kicked and why,
-- reconnects, totem pops, finished, warnings - for the Area Explorer page. Each event carries an id
-- made by the mod, so a batch sent again after a lost answer isn't stored twice.
CREATE TABLE IF NOT EXISTS area_explorer_events (
  id BIGSERIAL PRIMARY KEY,
  token_id BIGINT REFERENCES area_explorer_tokens(id) ON DELETE SET NULL,
  event_key TEXT NOT NULL,
  server TEXT NOT NULL,
  dimension TEXT NOT NULL,
  player TEXT NOT NULL DEFAULT '',
  level TEXT NOT NULL CHECK (level IN ('info', 'success', 'warn', 'error')),
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  x INTEGER,
  y INTEGER,
  z INTEGER,
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (token_id, event_key)
);

CREATE INDEX IF NOT EXISTS area_explorer_events_time_idx ON area_explorer_events (occurred_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS area_explorer_events_server_idx ON area_explorer_events (server, occurred_at DESC, id DESC);
