-- A marker made on the site's map keeps the colour it was given there (0xRRGGBB): the site shows it
-- as a banner of that colour. Null for every find a mod made. Markers made before take theirs from
-- the WAYPOINT command that sent them.
ALTER TABLE area_explorer_finds ADD COLUMN IF NOT EXISTS marker_color INTEGER;

UPDATE area_explorer_finds f SET marker_color = c.waypoint_color
FROM area_explorer_commands c
WHERE c.kind = 'WAYPOINT' AND f.kind = 'MARKER' AND f.marker_color IS NULL
  AND f.server = c.server AND f.dimension = c.dimension AND f.name = c.waypoint_name
  AND f.x = c.waypoint_x AND f.y = c.waypoint_y AND f.z = c.waypoint_z;
