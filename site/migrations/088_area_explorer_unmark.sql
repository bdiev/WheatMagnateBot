-- A find taken off the site takes its waypoint out of the mod's Xaero too, and so out of the PC that
-- takes that mod's markers through sharing: an UNMARK command to the mod that found it, with the
-- find's kind, name and block (waypoint_*).
ALTER TABLE area_explorer_commands DROP CONSTRAINT IF EXISTS area_explorer_commands_kind_check;
ALTER TABLE area_explorer_commands ADD CONSTRAINT area_explorer_commands_kind_check CHECK (kind IN ('EXPLORE', 'RESCAN', 'WAYPOINT', 'UNMARK'));

ALTER TABLE area_explorer_commands ADD COLUMN IF NOT EXISTS waypoint_find_kind TEXT;
