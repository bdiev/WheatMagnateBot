ALTER TABLE site_navigation_preferences
  ADD COLUMN IF NOT EXISTS account_timezone VARCHAR(64) NOT NULL DEFAULT 'Europe/Vilnius';

UPDATE site_navigation_preferences
SET account_timezone = COALESCE((SELECT timezone FROM obsidian_farm_analytics_settings WHERE id=1), account_timezone);
