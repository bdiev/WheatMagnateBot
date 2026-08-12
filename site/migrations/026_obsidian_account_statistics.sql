CREATE TABLE IF NOT EXISTS obsidian_account_farm_state (
  account_id UUID PRIMARY KEY REFERENCES bot_accounts(id) ON DELETE CASCADE,
  session_mined BIGINT NOT NULL DEFAULT 0 CHECK (session_mined >= 0),
  total_mined BIGINT NOT NULL DEFAULT 0 CHECK (total_mined >= 0),
  desired_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  session_started_at TIMESTAMPTZ,
  retired_pickaxes BIGINT NOT NULL DEFAULT 0 CHECK (retired_pickaxes >= 0),
  retired_pickaxe_blocks BIGINT NOT NULL DEFAULT 0 CHECK (retired_pickaxe_blocks >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS obsidian_account_farm_daily (
  account_id UUID NOT NULL REFERENCES bot_accounts(id) ON DELETE CASCADE,
  farm_date DATE NOT NULL,
  mined BIGINT NOT NULL DEFAULT 0 CHECK (mined >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(account_id,farm_date)
);

CREATE TABLE IF NOT EXISTS obsidian_account_farm_hourly (
  account_id UUID NOT NULL REFERENCES bot_accounts(id) ON DELETE CASCADE,
  bucket TIMESTAMPTZ NOT NULL,
  mined BIGINT NOT NULL DEFAULT 0 CHECK (mined >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(account_id,bucket)
);

CREATE TABLE IF NOT EXISTS obsidian_account_farm_supply_snapshot (
  account_id UUID PRIMARY KEY REFERENCES bot_accounts(id) ON DELETE CASCADE,
  supplies JSONB NOT NULL,
  observed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS obsidian_account_farm_supply_history (
  id BIGSERIAL PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES bot_accounts(id) ON DELETE CASCADE,
  supplies JSONB NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(account_id,observed_at)
);

CREATE TABLE IF NOT EXISTS obsidian_account_farm_tool_usage (
  id BIGSERIAL PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES bot_accounts(id) ON DELETE CASCADE,
  tool_name VARCHAR(80) NOT NULL,
  blocks_mined BIGINT NOT NULL DEFAULT 0,
  durability_used NUMERIC(12,2),
  remaining_percent NUMERIC(6,2),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS obsidian_account_farm_annotations (
  id BIGSERIAL PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES bot_accounts(id) ON DELETE CASCADE,
  event_type VARCHAR(40) NOT NULL,
  title TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS obsidian_account_daily_date_idx
  ON obsidian_account_farm_daily(farm_date,account_id);
CREATE INDEX IF NOT EXISTS obsidian_account_hourly_bucket_idx
  ON obsidian_account_farm_hourly(bucket,account_id);
CREATE INDEX IF NOT EXISTS obsidian_account_supply_history_idx
  ON obsidian_account_farm_supply_history(account_id,observed_at DESC);
CREATE INDEX IF NOT EXISTS obsidian_account_tool_usage_idx
  ON obsidian_account_farm_tool_usage(account_id,changed_at DESC);
CREATE INDEX IF NOT EXISTS obsidian_account_annotations_idx
  ON obsidian_account_farm_annotations(account_id,occurred_at DESC);
