ALTER TABLE obsidian_farm_analytics_settings
  ADD COLUMN IF NOT EXISTS last_daily_push_date DATE;
