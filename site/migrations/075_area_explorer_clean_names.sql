-- Item names with the § colour codes a resource pack or a server's translations put in them
-- ("Golden Apple §f(§f§f)") lose them, and the empty brackets they leave: the page matches names to
-- item pictures and values. The keys that tell finds apart follow; a find that turns out to be one
-- already in (clean) is dropped.
WITH cleaned AS (
  SELECT id, server, dimension,
    btrim(regexp_replace(regexp_replace(regexp_replace(name, '§.?', '', 'g'), '\(\s*\)|\[\s*\]', '', 'g'), '\s+', ' ', 'g')) AS clean_name
  FROM area_explorer_finds
  WHERE name LIKE '%§%'
), keyed AS (
  SELECT c.id, c.server, c.dimension, c.clean_name,
    CASE f.kind
      WHEN 'ITEM' THEN 'ITEM:' || f.x || ':' || f.y || ':' || f.z || ':' || c.clean_name || ':' || f.item_count || ':' || f.label
      WHEN 'MARKER' THEN 'MARKER:' || f.x || ':' || f.y || ':' || f.z || ':' || c.clean_name
      ELSE f.dedupe_key
    END AS clean_key
  FROM cleaned c JOIN area_explorer_finds f ON f.id = c.id
), dropped AS (
  DELETE FROM area_explorer_finds f USING keyed k
  WHERE f.id = k.id AND EXISTS (
    SELECT 1 FROM area_explorer_finds o
    WHERE o.server = k.server AND o.dimension = k.dimension AND o.dedupe_key = k.clean_key AND o.id <> k.id
  )
  RETURNING f.id
)
UPDATE area_explorer_finds f SET name = k.clean_name, dedupe_key = k.clean_key
FROM keyed k
WHERE f.id = k.id AND f.id NOT IN (SELECT id FROM dropped);
