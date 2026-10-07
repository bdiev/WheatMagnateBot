-- A named pet is one find however often it's sent: the same name on the same kind of marker within
-- 48 blocks is the same pet (as the mod's own waypoints have it), its label compared without case,
-- spaces or invisible characters. The copies after the first are dropped; the site checks on insert.
DELETE FROM area_explorer_finds f
USING area_explorer_finds o
WHERE f.kind = 'MARKER' AND o.kind = 'MARKER' AND f.label <> ''
  AND o.server = f.server AND o.dimension = f.dimension AND o.name = f.name AND o.id < f.id
  AND lower(regexp_replace(o.label, '[[:space:] ​-‏﻿]', '', 'g'))
    = lower(regexp_replace(f.label, '[[:space:] ​-‏﻿]', '', 'g'))
  AND (o.x - f.x)::bigint * (o.x - f.x)::bigint + (o.z - f.z)::bigint * (o.z - f.z)::bigint <= 48 * 48;
