-- One row per finished Pearl Loader request. System logs expire under the
-- retention policy, so the Control center counter reads from this table.
CREATE TABLE IF NOT EXISTS pearl_loader_requests (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(32) NOT NULL,
  account_id UUID,
  outcome VARCHAR(16) NOT NULL CHECK (outcome IN ('completed', 'no_pearl', 'failed')),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  duration_ms INTEGER
);

CREATE INDEX IF NOT EXISTS pearl_loader_requests_finished_idx
  ON pearl_loader_requests (finished_at DESC);

-- Carry over the requests whose summary logs have not expired yet.
DO $$ BEGIN
  IF to_regclass('public.site_system_logs') IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO pearl_loader_requests (username, account_id, outcome, started_at, finished_at, duration_ms)
  SELECT LEFT(COALESCE(NULLIF(l.details->>'username', ''), '?'), 32),
         CASE WHEN l.details->>'accountId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              THEN (l.details->>'accountId')::uuid END,
         l.details->>'outcome',
         CASE WHEN l.details->>'startedAt' IS NOT NULL THEN (l.details->>'startedAt')::timestamptz END,
         COALESCE((l.details->>'finishedAt')::timestamptz, l.created_at),
         CASE WHEN l.details->>'durationMs' ~ '^[0-9]{1,9}$' THEN (l.details->>'durationMs')::int END
  FROM site_system_logs l
  WHERE l.category = 'pearl_loader'
    AND l.details->>'outcome' IN ('completed', 'no_pearl', 'failed')
    AND NOT EXISTS (SELECT 1 FROM pearl_loader_requests);
END $$;
