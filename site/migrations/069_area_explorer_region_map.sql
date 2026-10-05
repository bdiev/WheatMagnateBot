-- The live Xaero map the OnFocus mod sends: tiles anchored to the world. Level 0 is Xaero's
-- regions (512 x 512 blocks, a pixel a block, lossless WebP); a level-k tile covers 2^k regions a
-- side shrunk to 512 px. source_modified_at is when the mod's copy of a region was last drawn.
CREATE TABLE IF NOT EXISTS area_explorer_region_tiles (
  server TEXT NOT NULL,
  dimension TEXT NOT NULL,
  level SMALLINT NOT NULL,
  x INTEGER NOT NULL,
  z INTEGER NOT NULL,
  data BYTEA NOT NULL,
  source_modified_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (server, dimension, level, x, z)
);

-- Tiles above level 0 waiting to be rebuilt from the ones under them.
CREATE TABLE IF NOT EXISTS area_explorer_region_dirty (
  server TEXT NOT NULL,
  dimension TEXT NOT NULL,
  level SMALLINT NOT NULL,
  x INTEGER NOT NULL,
  z INTEGER NOT NULL,
  dirty_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (server, dimension, level, x, z)
);

CREATE INDEX IF NOT EXISTS area_explorer_region_dirty_order_idx ON area_explorer_region_dirty (level, dirty_at);
