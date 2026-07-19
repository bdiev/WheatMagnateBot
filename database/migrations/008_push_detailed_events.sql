ALTER TABLE push_subscriptions
  ADD COLUMN IF NOT EXISTS detailed_event_types TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
