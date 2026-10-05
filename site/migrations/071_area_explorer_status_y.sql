-- The explorer's height (Y) beside X and Z in its live status; and the hand-uploaded Xaero PNG
-- layers go: the map now comes from the mod itself (area_explorer_region_tiles).
ALTER TABLE area_explorer_status ADD COLUMN IF NOT EXISTS y INTEGER;
DROP TABLE IF EXISTS area_explorer_map_tiles;
DROP TABLE IF EXISTS area_explorer_map_layers;
