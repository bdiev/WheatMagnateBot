CREATE TABLE IF NOT EXISTS bot_account_auth_cache (
  account_id UUID PRIMARY KEY REFERENCES bot_accounts(id) ON DELETE CASCADE,
  ciphertext BYTEA NOT NULL,
  nonce BYTEA NOT NULL,
  auth_tag BYTEA NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
