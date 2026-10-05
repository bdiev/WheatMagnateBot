-- Xaero's World Map exports under the Area Explorer map: one layer per uploaded PNG, cut into a
-- Google-layout pyramid of WebP tiles (level max_zoom is the image's own resolution).
-- origin_x/origin_z is the world position of the image's top-left pixel.
CREATE TABLE IF NOT EXISTS area_explorer_map_layers (
  id BIGSERIAL PRIMARY KEY,
  server TEXT NOT NULL,
  dimension TEXT NOT NULL,
  name TEXT NOT NULL,
  origin_x DOUBLE PRECISION NOT NULL,
  origin_z DOUBLE PRECISION NOT NULL,
  blocks_per_pixel DOUBLE PRECISION NOT NULL DEFAULT 1 CHECK (blocks_per_pixel > 0),
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  tile_size INTEGER NOT NULL DEFAULT 256,
  max_zoom INTEGER NOT NULL,
  tile_count INTEGER NOT NULL DEFAULT 0,
  bytes BIGINT NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS area_explorer_map_layers_scope_idx ON area_explorer_map_layers (server, dimension, created_at);

CREATE TABLE IF NOT EXISTS area_explorer_map_tiles (
  layer_id BIGINT NOT NULL REFERENCES area_explorer_map_layers(id) ON DELETE CASCADE,
  z SMALLINT NOT NULL,
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  data BYTEA NOT NULL,
  PRIMARY KEY (layer_id, z, y, x)
);
