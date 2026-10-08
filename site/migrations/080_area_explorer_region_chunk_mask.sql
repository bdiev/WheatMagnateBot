-- Which of a region's 32 x 32 chunks Xaero has drawn: 1024 bits, chunk (cx, cz) within the region
-- at bit cz * 32 + cx (low bit first). Level 0 only; NULL until worked out for a region stored before.
ALTER TABLE area_explorer_region_tiles ADD COLUMN IF NOT EXISTS chunk_mask BYTEA;
