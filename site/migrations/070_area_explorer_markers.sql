-- Markers among the Area Explorer finds: what the mod's auto markers mark - End Portals, Shulker
-- Boxes, spawners, custom blocks... - named in name. One per block and name.
ALTER TABLE area_explorer_finds DROP CONSTRAINT IF EXISTS area_explorer_finds_kind_check;
ALTER TABLE area_explorer_finds ADD CONSTRAINT area_explorer_finds_kind_check CHECK (kind IN ('BASE', 'SIGN', 'ITEM', 'MARKER'));
CREATE INDEX IF NOT EXISTS area_explorer_finds_marker_name_idx ON area_explorer_finds (server, dimension, name) WHERE kind = 'MARKER';
