-- The site's map asks for the finds of the area in view, by coordinates: however many finds there
-- are, only that part is read.
CREATE INDEX IF NOT EXISTS area_explorer_finds_xz_idx ON area_explorer_finds (server, dimension, x, z) WHERE removed_at IS NULL;
