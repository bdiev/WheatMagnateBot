CREATE TABLE IF NOT EXISTS push_subscriptions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  device_name VARCHAR(80) NOT NULL DEFAULT 'Browser',
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  minimum_severity VARCHAR(16) NOT NULL DEFAULT 'critical' CHECK (minimum_severity IN ('info', 'warning', 'critical')),
  event_types TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  include_resolved BOOLEAN NOT NULL DEFAULT FALSE,
  quiet_hours_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  quiet_start TIME NOT NULL DEFAULT '22:00',
  quiet_end TIME NOT NULL DEFAULT '07:00',
  timezone VARCHAR(64) NOT NULL DEFAULT 'Europe/Vilnius',
  last_success_at TIMESTAMPTZ,
  failure_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON push_subscriptions(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS push_subscriptions_delivery_idx ON push_subscriptions(enabled, minimum_severity) WHERE enabled;

DO $$
BEGIN
  IF to_regclass('public.site_users') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='push_subscriptions_user_fk'
  ) THEN
    ALTER TABLE push_subscriptions ADD CONSTRAINT push_subscriptions_user_fk
      FOREIGN KEY(user_id) REFERENCES site_users(id) ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE notification_deliveries DROP CONSTRAINT IF EXISTS notification_deliveries_channel_check;
ALTER TABLE notification_deliveries ADD CONSTRAINT notification_deliveries_channel_check
  CHECK (channel IN ('discord', 'site', 'system_log', 'push'));
