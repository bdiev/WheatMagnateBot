-- Area Explorer commands from the site to a mod: explore or rescan a chunk rectangle picked on the
-- site's map, by an administrator. A mod picks up its commands in the answer to its status uploads;
-- one not picked up within minutes goes stale, and a newer one for the same mod replaces it.
CREATE TABLE IF NOT EXISTS area_explorer_commands (
  id BIGSERIAL PRIMARY KEY,
  token_id BIGINT NOT NULL REFERENCES area_explorer_tokens(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('EXPLORE', 'RESCAN')),
  server TEXT NOT NULL,
  dimension TEXT NOT NULL,
  min_cx INTEGER NOT NULL,
  min_cz INTEGER NOT NULL,
  max_cx INTEGER NOT NULL,
  max_cz INTEGER NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS area_explorer_commands_pending_idx ON area_explorer_commands (token_id) WHERE delivered_at IS NULL AND cancelled_at IS NULL;
