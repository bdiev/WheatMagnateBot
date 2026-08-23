CREATE TABLE IF NOT EXISTS kill_aura_hourly_kills (
  account_id UUID NOT NULL REFERENCES bot_accounts(id) ON DELETE CASCADE,
  mob_name TEXT NOT NULL,
  bucket TIMESTAMPTZ NOT NULL,
  kills BIGINT NOT NULL DEFAULT 0 CHECK (kills >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (account_id, mob_name, bucket)
);

CREATE INDEX IF NOT EXISTS kill_aura_hourly_kills_account_bucket_idx
  ON kill_aura_hourly_kills(account_id, bucket DESC);
