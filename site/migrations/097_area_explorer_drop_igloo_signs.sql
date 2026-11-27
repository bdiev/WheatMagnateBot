-- The sign every igloo's basement comes with ("<----" over "---->", the other side blank) is made by
-- the world, not a player: the ones in are dropped, and the site and the mod no longer keep new ones.
DELETE FROM area_explorer_finds
WHERE kind = 'SIGN'
  AND (
    (regexp_replace(coalesce(details, ''), '[[:space:]]+', '', 'g') = '<-------->' AND btrim(coalesce(label, ''), E' \n\t') = '')
    OR (regexp_replace(coalesce(label, ''), '[[:space:]]+', '', 'g') = '<-------->' AND btrim(coalesce(details, ''), E' \n\t') = '')
  );
