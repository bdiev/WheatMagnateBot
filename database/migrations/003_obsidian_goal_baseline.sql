ALTER TABLE obsidian_farm_goals
  ADD COLUMN IF NOT EXISTS baseline_mined BIGINT;
