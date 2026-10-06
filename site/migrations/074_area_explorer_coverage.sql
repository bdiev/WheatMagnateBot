-- The ground the explorer has flown over this run, for the site's map: a grid of cells over the
-- run's area as the mod sends it ({version, cell, minCX, minCZ, cols, rows, bits}). Cleared when the run ends.
ALTER TABLE area_explorer_status ADD COLUMN IF NOT EXISTS coverage JSONB;
