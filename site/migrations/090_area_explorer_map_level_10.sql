-- The map now reaches ±250k from 0, 0, so its tiles go one level higher, to 10. Maps drawn before
-- have their level-10 tiles built from the level-9 ones they already have.
INSERT INTO area_explorer_region_dirty (server, dimension, level, x, z)
SELECT DISTINCT server, dimension, 10, FLOOR(x / 2.0)::int, FLOOR(z / 2.0)::int
FROM area_explorer_region_tiles
WHERE level = 9
ON CONFLICT (server, dimension, level, x, z) DO NOTHING;
