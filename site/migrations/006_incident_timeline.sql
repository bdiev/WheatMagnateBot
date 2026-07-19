CREATE TABLE IF NOT EXISTS operational_events (
  id BIGSERIAL PRIMARY KEY,
  event_type VARCHAR(80) NOT NULL,
  severity VARCHAR(16) NOT NULL CHECK (severity IN ('info','warning','critical')),
  source VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor VARCHAR(128),
  resource_key VARCHAR(255),
  correlation_id VARCHAR(64) NOT NULL,
  source_record_type VARCHAR(64),
  source_record_id VARCHAR(128),
  sensitive BOOLEAN NOT NULL DEFAULT FALSE,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS operational_events_source_ref_idx ON operational_events(source_record_type,source_record_id) WHERE source_record_type IS NOT NULL AND source_record_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS operational_events_occurred_idx ON operational_events(occurred_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS operational_events_correlation_idx ON operational_events(correlation_id,occurred_at);
CREATE INDEX IF NOT EXISTS operational_events_resource_idx ON operational_events(resource_key,occurred_at DESC);
CREATE TABLE IF NOT EXISTS operational_events_archive (
  id BIGINT PRIMARY KEY,event_type VARCHAR(80) NOT NULL,severity VARCHAR(16) NOT NULL,source VARCHAR(64) NOT NULL,title VARCHAR(255) NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,actor VARCHAR(128),resource_key VARCHAR(255),correlation_id VARCHAR(64) NOT NULL,
  source_record_type VARCHAR(64),source_record_id VARCHAR(128),sensitive BOOLEAN NOT NULL DEFAULT FALSE,
  occurred_at TIMESTAMPTZ NOT NULL,created_at TIMESTAMPTZ NOT NULL,archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS operational_events_archive_occurred_idx ON operational_events_archive(occurred_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS operational_events_archive_correlation_idx ON operational_events_archive(correlation_id,occurred_at);
CREATE TABLE IF NOT EXISTS incidents (
  id BIGSERIAL PRIMARY KEY,title VARCHAR(255) NOT NULL,status VARCHAR(24) NOT NULL DEFAULT 'open' CHECK (status IN ('open','investigating','resolved','closed')),
  cause TEXT,notes TEXT,resolution TEXT,assigned_admin_id BIGINT,
  created_by BIGINT NOT NULL,root_event_id BIGINT NOT NULL REFERENCES operational_events(id) ON DELETE RESTRICT,
  correlation_id VARCHAR(64) NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS incidents_status_updated_idx ON incidents(status,updated_at DESC);
CREATE INDEX IF NOT EXISTS incidents_correlation_idx ON incidents(correlation_id);
CREATE TABLE IF NOT EXISTS incident_events (
  incident_id BIGINT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,operational_event_id BIGINT NOT NULL REFERENCES operational_events(id) ON DELETE RESTRICT,
  relationship VARCHAR(32) NOT NULL DEFAULT 'related',added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(incident_id,operational_event_id)
);
DO $$ BEGIN IF to_regclass('public.bot_commands') IS NOT NULL THEN
  ALTER TABLE bot_commands ADD COLUMN IF NOT EXISTS correlation_id VARCHAR(64);
  CREATE INDEX IF NOT EXISTS bot_commands_correlation_idx ON bot_commands(correlation_id) WHERE correlation_id IS NOT NULL;
END IF; END $$;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS correlation_id VARCHAR(64);
ALTER TABLE obsidian_farm_annotations ADD COLUMN IF NOT EXISTS correlation_id VARCHAR(64);
CREATE INDEX IF NOT EXISTS notifications_correlation_idx ON notifications(correlation_id) WHERE correlation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS obsidian_annotations_correlation_idx ON obsidian_farm_annotations(correlation_id) WHERE correlation_id IS NOT NULL;
