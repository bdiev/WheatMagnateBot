CREATE TABLE IF NOT EXISTS notification_rules (
  event_type VARCHAR(64) PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  severity VARCHAR(16) NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  threshold JSONB,
  cooldown_seconds INTEGER NOT NULL DEFAULT 300 CHECK (cooldown_seconds >= 0),
  delivery_channels TEXT[] NOT NULL DEFAULT ARRAY['site', 'system_log']::TEXT[],
  last_triggered_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  event_type VARCHAR(64) NOT NULL REFERENCES notification_rules(event_type),
  dedup_key VARCHAR(255) NOT NULL,
  severity VARCHAR(16) NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  status VARCHAR(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved')),
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  first_triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  read_by BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS notifications_active_dedup_idx
  ON notifications (event_type, dedup_key) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS notifications_status_created_idx
  ON notifications (status, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_unread_idx
  ON notifications (read_at, created_at DESC);

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id BIGSERIAL PRIMARY KEY,
  notification_id BIGINT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  channel VARCHAR(32) NOT NULL CHECK (channel IN ('discord', 'site', 'system_log')),
  status VARCHAR(16) NOT NULL CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  error TEXT,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS notification_deliveries_notification_idx
  ON notification_deliveries (notification_id, attempted_at DESC);

INSERT INTO notification_rules (event_type, severity, threshold, cooldown_seconds, delivery_channels)
VALUES
  ('bot_disconnected', 'critical', NULL, 300, ARRAY['discord','site','system_log']),
  ('bot_reconnected', 'info', NULL, 60, ARRAY['discord','site','system_log']),
  ('bot_kicked', 'critical', NULL, 300, ARRAY['discord','site','system_log']),
  ('unauthorized_player_nearby', 'critical', '{"distance":300}', 300, ARRAY['discord','site','system_log']),
  ('low_pickaxe_durability', 'warning', '{"percent":10}', 600, ARRAY['discord','site','system_log']),
  ('no_pickaxes', 'critical', '{"count":1}', 600, ARRAY['discord','site','system_log']),
  ('low_food', 'warning', '{"food":8}', 300, ARRAY['discord','site','system_log']),
  ('farm_stalled', 'critical', '{"seconds":120}', 600, ARRAY['discord','site','system_log']),
  ('low_tps', 'warning', '{"tps":15}', 300, ARRAY['discord','site','system_log']),
  ('database_unavailable', 'critical', NULL, 300, ARRAY['discord','site','system_log']),
  ('repeated_reconnects', 'critical', '{"attempts":3,"window_seconds":300}', 600, ARRAY['discord','site','system_log']),
  ('command_failed', 'warning', NULL, 300, ARRAY['discord','site','system_log'])
ON CONFLICT (event_type) DO NOTHING;
