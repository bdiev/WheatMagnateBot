-- Area Explorer commands are confirmed by the mod: a command is sent again until the mod reports
-- what became of it (by id, so it never runs twice), and the site shows that and why.
--   queued    - waiting for the mod to check in
--   delivered - sent, the mod hasn't confirmed it yet (sent again)
--   accepted / running / stopped / completed / rejected - as the mod reported
--   cancelled - replaced by a newer command before the mod confirmed it
--   expired   - the mod never confirmed it in time
ALTER TABLE area_explorer_commands
  ADD COLUMN IF NOT EXISTS state TEXT NOT NULL DEFAULT 'queued',
  ADD COLUMN IF NOT EXISTS state_reason TEXT,
  ADD COLUMN IF NOT EXISTS state_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivery_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS confirms BOOLEAN NOT NULL DEFAULT FALSE;

-- Commands from before: sent once, never confirmed
UPDATE area_explorer_commands SET
  state = CASE
    WHEN cancelled_at IS NOT NULL THEN 'cancelled'
    WHEN delivered_at IS NOT NULL THEN 'delivered'
    WHEN created_at > NOW() - INTERVAL '10 minutes' THEN 'queued'
    ELSE 'expired'
  END,
  state_at = COALESCE(cancelled_at, delivered_at, created_at),
  delivery_count = CASE WHEN delivered_at IS NOT NULL THEN 1 ELSE 0 END
WHERE state = 'queued';

ALTER TABLE area_explorer_commands DROP CONSTRAINT IF EXISTS area_explorer_commands_state_check;
ALTER TABLE area_explorer_commands ADD CONSTRAINT area_explorer_commands_state_check
  CHECK (state IN ('queued', 'delivered', 'accepted', 'running', 'stopped', 'completed', 'rejected', 'cancelled', 'expired'));

DROP INDEX IF EXISTS area_explorer_commands_pending_idx;
CREATE INDEX IF NOT EXISTS area_explorer_commands_open_idx ON area_explorer_commands (token_id) WHERE state IN ('queued', 'delivered');
CREATE INDEX IF NOT EXISTS area_explorer_commands_recent_idx ON area_explorer_commands (created_at DESC);
