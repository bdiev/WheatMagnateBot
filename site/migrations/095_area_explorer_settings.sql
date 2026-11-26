-- Area Explorer settings administrators change on the site, one row per setting. 'highlights': the
-- loot the Highlights panel looks for among the finds, most important first ([{name, match}]). No
-- row: the built-in list.
CREATE TABLE IF NOT EXISTS area_explorer_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
