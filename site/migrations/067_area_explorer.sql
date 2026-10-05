-- Area Explorer (OnFocus Meteor addon): finds uploaded by the mod, and its live run status.
-- The mod authenticates with an API token made by an administrator; only its hash is stored.
CREATE TABLE IF NOT EXISTS area_explorer_tokens (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  token_hint TEXT NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

-- One row per find, with no find twice: signs by block, items by kind/count/name and block,
-- bases by position (a base within 64 blocks of one already in is the same base; checked on insert).
CREATE TABLE IF NOT EXISTS area_explorer_finds (
  id BIGSERIAL PRIMARY KEY,
  server TEXT NOT NULL,
  dimension TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('BASE', 'SIGN', 'ITEM')),
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  z INTEGER NOT NULL,
  found_at TIMESTAMPTZ NOT NULL,
  name TEXT NOT NULL,
  item_count INTEGER NOT NULL DEFAULT 0,
  label TEXT NOT NULL DEFAULT '',
  details TEXT NOT NULL DEFAULT '',
  dedupe_key TEXT NOT NULL,
  token_id BIGINT REFERENCES area_explorer_tokens(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (server, dimension, dedupe_key)
);

CREATE INDEX IF NOT EXISTS area_explorer_finds_scope_idx ON area_explorer_finds (server, dimension, kind, found_at DESC);

-- The last status each mod (token) reported: where it is and how far the run got.
CREATE TABLE IF NOT EXISTS area_explorer_status (
  token_id BIGINT PRIMARY KEY REFERENCES area_explorer_tokens(id) ON DELETE CASCADE,
  server TEXT NOT NULL DEFAULT '',
  dimension TEXT NOT NULL DEFAULT '',
  player TEXT NOT NULL DEFAULT '',
  phase TEXT NOT NULL DEFAULT 'IDLE',
  mode TEXT NOT NULL DEFAULT '',
  paused BOOLEAN NOT NULL DEFAULT FALSE,
  percent REAL,
  eta_seconds INTEGER,
  x INTEGER,
  z INTEGER,
  area JSONB,
  run_finds JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
