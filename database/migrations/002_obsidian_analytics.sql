CREATE TABLE IF NOT EXISTS obsidian_farm_supply_history (
  id BIGSERIAL PRIMARY KEY,
  supplies JSONB NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_obsidian_supply_history_observed
  ON obsidian_farm_supply_history (observed_at DESC);

CREATE TABLE IF NOT EXISTS obsidian_farm_annotations (
  id BIGSERIAL PRIMARY KEY,
  event_type VARCHAR(40) NOT NULL,
  title TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_obsidian_annotations_occurred
  ON obsidian_farm_annotations (occurred_at DESC);

CREATE TABLE IF NOT EXISTS obsidian_farm_tool_usage (
  id BIGSERIAL PRIMARY KEY,
  tool_name VARCHAR(80) NOT NULL,
  blocks_mined BIGINT NOT NULL DEFAULT 0,
  durability_used NUMERIC(12,2),
  remaining_percent NUMERIC(6,2),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_obsidian_tool_usage_changed ON obsidian_farm_tool_usage (changed_at DESC);

CREATE TABLE IF NOT EXISTS obsidian_farm_goals (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  target_total BIGINT NOT NULL CHECK (target_total > 0),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reached_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_obsidian_goals_active ON obsidian_farm_goals (active, created_at DESC);

CREATE TABLE IF NOT EXISTS obsidian_farm_analytics_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  timezone TEXT NOT NULL DEFAULT 'Europe/Vilnius',
  daily_report_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  daily_report_hour SMALLINT NOT NULL DEFAULT 9 CHECK (daily_report_hour BETWEEN 0 AND 23),
  last_daily_report_date DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
