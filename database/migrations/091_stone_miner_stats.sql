CREATE TABLE IF NOT EXISTS stone_miner_hourly_blocks (
  account_id UUID NOT NULL REFERENCES bot_accounts(id) ON DELETE CASCADE,
  bucket TIMESTAMPTZ NOT NULL,
  blocks BIGINT NOT NULL DEFAULT 0 CHECK (blocks >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (account_id, bucket)
);

CREATE TABLE IF NOT EXISTS stone_miner_retired_pickaxes (
  id BIGSERIAL PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES bot_accounts(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  blocks_mined BIGINT NOT NULL DEFAULT 0 CHECK (blocks_mined >= 0),
  count_in_average BOOLEAN NOT NULL DEFAULT FALSE,
  retired_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS stone_miner_retired_pickaxes_account_idx
  ON stone_miner_retired_pickaxes(account_id, retired_at DESC);
