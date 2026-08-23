CREATE TABLE IF NOT EXISTS player_info_backfill_schedule (
  id SMALLINT PRIMARY KEY CHECK (id = 1),
  next_run_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO player_info_backfill_schedule(id, next_run_at)
VALUES (1, NULL)
ON CONFLICT(id) DO NOTHING;
