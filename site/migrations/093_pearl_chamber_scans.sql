-- What the Pearl Loader last saw at each stasis chamber. Each time it is in
-- game it looks at every configured trapdoor within view, so a "pearl"
-- whisper can be answered without sending it out. Keyed by the trapdoor, so a
-- player whose hatch moves has no answer until the new one has been seen.
CREATE TABLE IF NOT EXISTS pearl_chamber_scans (
  hatch_x INTEGER NOT NULL,
  hatch_y INTEGER NOT NULL,
  hatch_z INTEGER NOT NULL,
  pearl_present BOOLEAN NOT NULL,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (hatch_x, hatch_y, hatch_z)
);
