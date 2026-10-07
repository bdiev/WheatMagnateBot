-- Remove resource-pack private-use badges from existing find names, keeping labels and sign text.
-- Rebuild item/marker identity and resolve collisions before updating the unique keys.
WITH cleaned AS (
  SELECT f.*,
    btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(name,
      '§.?', '', 'g'), U&'[\E000-\F8FF\+0F0000-\+0FFFFD\+100000-\+10FFFD]', '', 'g'),
      '\(\s*\)|\[\s*\]', '', 'g'), '\s+', ' ', 'g')) AS clean_name
  FROM area_explorer_finds f
), keyed AS (
  SELECT *, CASE WHEN clean_name = '' THEN dedupe_key ELSE CASE kind
    WHEN 'ITEM' THEN 'ITEM:' || x || ':' || y || ':' || z || ':' || clean_name || ':' || item_count || ':' || label
    WHEN 'MARKER' THEN 'MARKER:' || x || ':' || y || ':' || z || ':' || clean_name
      || CASE WHEN label <> '' THEN ':' || label ELSE '' END
    ELSE dedupe_key END END AS clean_key
  FROM cleaned
), ranked AS (
  SELECT *, row_number() OVER (PARTITION BY server, dimension, clean_key
    ORDER BY (removed_at IS NULL) DESC, id) AS duplicate_number
  FROM keyed
), dropped AS (
  DELETE FROM area_explorer_finds f USING ranked r
  WHERE f.id = r.id AND r.duplicate_number > 1
  RETURNING f.id
)
UPDATE area_explorer_finds f SET name = r.clean_name, dedupe_key = r.clean_key
FROM ranked r
WHERE f.id = r.id AND r.clean_name <> '' AND r.duplicate_number = 1
  AND (f.name <> r.clean_name OR f.dedupe_key <> r.clean_key)
  AND f.id NOT IN (SELECT id FROM dropped);
