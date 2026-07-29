CREATE TABLE IF NOT EXISTS kill_aura_state (
  account_id UUID PRIMARY KEY REFERENCES bot_accounts(id) ON DELETE CASCADE,
  desired_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  selected_mobs TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kill_aura_kills (
  account_id UUID NOT NULL REFERENCES bot_accounts(id) ON DELETE CASCADE,
  mob_name TEXT NOT NULL,
  kills BIGINT NOT NULL DEFAULT 0 CHECK (kills >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (account_id, mob_name)
);

CREATE INDEX IF NOT EXISTS kill_aura_kills_account_kills_idx
  ON kill_aura_kills(account_id, kills DESC);

INSERT INTO kill_aura_state(account_id)
SELECT id FROM bot_accounts
ON CONFLICT(account_id) DO NOTHING;
