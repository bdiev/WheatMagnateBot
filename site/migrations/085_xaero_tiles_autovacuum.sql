-- Map tiles are rewritten whole, often (a region redrawn in flight, the tiles above it rebuilt), and
-- each rewrite leaves the old picture behind as a dead row in the TOAST table. By default autovacuum
-- waits for a fifth of the table to be dead first: gigabytes here, so the disk kept growing. Vacuum
-- once 2% is dead, so the space is reused instead.
ALTER TABLE area_explorer_region_tiles SET (
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_vacuum_threshold = 200,
  toast.autovacuum_vacuum_scale_factor = 0.02,
  toast.autovacuum_vacuum_threshold = 200
);
