-- Any bot in game near the chambers now scans them. A loaded block at the
-- saved coordinates that is not a trapdoor flags the coordinates as wrong, and
-- a player whose chamber was seen empty is reminded once when joining.
ALTER TABLE pearl_chamber_scans
  ADD COLUMN IF NOT EXISTS hatch_found BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS block_name VARCHAR(64),
  ADD COLUMN IF NOT EXISTS empty_reminded_at TIMESTAMPTZ;
