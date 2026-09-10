-- Preserve existing alerts and delivery history while allowing each account
-- to own an independent issue. Legacy primary alerts keep the empty scope.
DROP INDEX IF EXISTS notifications_active_dedup_idx;
CREATE UNIQUE INDEX notifications_active_dedup_idx
  ON notifications (event_type, dedup_key, (COALESCE(metadata->>'accountId', '')))
  WHERE status = 'active';
