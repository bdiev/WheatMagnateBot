-- Reconcile installations where the request feature or command bus schema was
-- deployed before all delivery columns were present. This migration is kept
-- separate from 018 because applied migrations are intentionally immutable.
ALTER TABLE resource_requests ADD COLUMN IF NOT EXISTS delivery_coordinates VARCHAR(160);
ALTER TABLE resource_requests ADD COLUMN IF NOT EXISTS admin_note VARCHAR(500);
ALTER TABLE resource_requests ADD COLUMN IF NOT EXISTS delivery_command_id BIGINT;
ALTER TABLE resource_requests ADD COLUMN IF NOT EXISTS ready_at TIMESTAMPTZ;
ALTER TABLE resource_requests ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ;
ALTER TABLE resource_requests ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE resource_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS resource_request_admin_sessions (
  token_hash TEXT PRIMARY KEY,
  site_user_id BIGINT NOT NULL,
  csrf_token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS resource_request_admin_sessions_user_idx
  ON resource_request_admin_sessions(site_user_id);

ALTER TABLE bot_commands ADD COLUMN IF NOT EXISTS correlation_id VARCHAR(64);
ALTER TABLE bot_commands ADD COLUMN IF NOT EXISTS locked_by VARCHAR(128);
ALTER TABLE bot_commands ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ;
ALTER TABLE bot_commands ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bot_commands ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(128);

CREATE UNIQUE INDEX IF NOT EXISTS bot_commands_account_idempotency_idx
  ON bot_commands(account_id,idempotency_key) WHERE idempotency_key IS NOT NULL;
