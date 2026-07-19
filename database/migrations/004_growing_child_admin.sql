CREATE TABLE IF NOT EXISTS growing_child_admin_snapshot (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
