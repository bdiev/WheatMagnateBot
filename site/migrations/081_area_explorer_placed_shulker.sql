-- A shulker box block standing in the world is marked "Placed Shulker Box" now, told from shulker
-- boxes lying on the ground ("Loot: Shulker Box ..."), whose contents the mod can read. Older markers
-- take the new name and key; where one with the new name is in already the old one goes, a removal
-- winning so a removed marker stays removed.
WITH renamed AS (
  SELECT id, server, dimension, removed_at,
    'MARKER:' || x || ':' || y || ':' || z || ':Placed Shulker Box' AS new_key
  FROM area_explorer_finds
  WHERE kind = 'MARKER' AND name = 'Shulker Box' AND label = ''
), clashing AS (
  SELECT r.id AS old_id, o.id AS new_id, r.removed_at AS old_removed, o.removed_at AS new_removed
  FROM renamed r JOIN area_explorer_finds o
    ON o.server = r.server AND o.dimension = r.dimension AND o.dedupe_key = r.new_key
), carried AS (
  UPDATE area_explorer_finds f SET removed_at = c.old_removed
  FROM clashing c
  WHERE f.id = c.new_id AND c.new_removed IS NULL AND c.old_removed IS NOT NULL
  RETURNING f.id
), dropped AS (
  DELETE FROM area_explorer_finds f USING clashing c
  WHERE f.id = c.old_id
  RETURNING f.id
)
UPDATE area_explorer_finds f SET name = 'Placed Shulker Box', dedupe_key = r.new_key
FROM renamed r
WHERE f.id = r.id AND f.id NOT IN (SELECT old_id FROM clashing);
