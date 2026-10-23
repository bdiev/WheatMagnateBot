-- Markers made on the site's map by an administrator: a WAYPOINT command takes one to a mod, which
-- puts it in Xaero's waypoints (set "Site Markers"); a PC taking the mod's markers through sharing
-- gets it from there. min/max chunk are the waypoint's chunk.
ALTER TABLE area_explorer_commands DROP CONSTRAINT IF EXISTS area_explorer_commands_kind_check;
ALTER TABLE area_explorer_commands ADD CONSTRAINT area_explorer_commands_kind_check CHECK (kind IN ('EXPLORE', 'RESCAN', 'WAYPOINT'));

ALTER TABLE area_explorer_commands
  ADD COLUMN IF NOT EXISTS waypoint_name TEXT,
  ADD COLUMN IF NOT EXISTS waypoint_x INTEGER,
  ADD COLUMN IF NOT EXISTS waypoint_y INTEGER,
  ADD COLUMN IF NOT EXISTS waypoint_z INTEGER,
  ADD COLUMN IF NOT EXISTS waypoint_color INTEGER;
