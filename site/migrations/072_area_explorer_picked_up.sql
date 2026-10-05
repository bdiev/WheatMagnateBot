-- Loot taken off the site once it's been picked up in game. The row stays, so the mod sending the
-- same find again (same dedupe key) doesn't bring it back; every query leaves picked-up finds out.
ALTER TABLE area_explorer_finds ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ;
ALTER TABLE area_explorer_finds ADD COLUMN IF NOT EXISTS removed_by TEXT;
