ALTER TABLE obsidian_farm_analytics_settings
  ADD COLUMN IF NOT EXISTS last_player_milestone_push_date DATE;
