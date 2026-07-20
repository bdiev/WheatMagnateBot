CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS bot_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(64) NOT NULL,
  display_name VARCHAR(96) NOT NULL,
  host VARCHAR(255) NOT NULL,
  port INTEGER NOT NULL DEFAULT 25565 CHECK (port BETWEEN 1 AND 65535),
  minecraft_version VARCHAR(32),
  auth_type VARCHAR(24) NOT NULL DEFAULT 'microsoft' CHECK (auth_type IN ('microsoft','offline')),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  color VARCHAR(16),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_connected_at TIMESTAMPTZ,
  sort_order INTEGER NOT NULL DEFAULT 0,
  reconnect_backoff_ms INTEGER NOT NULL DEFAULT 5000 CHECK (reconnect_backoff_ms BETWEEN 1000 AND 300000),
  is_default BOOLEAN NOT NULL DEFAULT FALSE
  ,deleted_at TIMESTAMPTZ
);
ALTER TABLE bot_accounts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS bot_accounts_one_default_idx ON bot_accounts(is_default) WHERE is_default;
CREATE INDEX IF NOT EXISTS bot_accounts_sort_idx ON bot_accounts(sort_order,created_at);

INSERT INTO bot_accounts(id,username,display_name,host,port,auth_type,enabled,is_default)
VALUES('00000000-0000-4000-8000-000000000001','legacy','WheatMagnate','localhost',25565,'microsoft',TRUE,TRUE)
ON CONFLICT DO NOTHING;

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'bot_status_snapshots','bot_commands','admin_settings','obsidian_farm_state',
    'obsidian_farm_daily','obsidian_farm_hourly','obsidian_farm_supply_snapshot',
    'nearby_player_sightings','bot_tps_samples','game_chat_messages','inventory_snapshots','farm_history','site_system_logs'
  ] LOOP
    IF to_regclass('public.' || table_name) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS account_id UUID', table_name);
      EXECUTE format(
        'UPDATE %I SET account_id=$1::uuid WHERE account_id IS NULL',
        table_name
      ) USING '00000000-0000-4000-8000-000000000001';
      EXECUTE format(
        'ALTER TABLE %I ALTER COLUMN account_id SET DEFAULT %L::uuid',
        table_name, '00000000-0000-4000-8000-000000000001'
      );
      EXECUTE format('ALTER TABLE %I ALTER COLUMN account_id SET NOT NULL', table_name);
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = ('public.' || table_name)::regclass
          AND conname = table_name || '_account_id_fkey'
      ) THEN
        EXECUTE format(
          'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY(account_id) REFERENCES bot_accounts(id)',
          table_name, table_name || '_account_id_fkey'
        );
      END IF;
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I(account_id)', table_name || '_account_idx', table_name);
    END IF;
  END LOOP;
END $$;

DO $$ BEGIN
  IF to_regclass('public.bot_commands') IS NOT NULL THEN
    ALTER TABLE bot_commands ADD COLUMN IF NOT EXISTS locked_by VARCHAR(128);
    ALTER TABLE bot_commands ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ;
    ALTER TABLE bot_commands ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE bot_commands ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(128);
    CREATE UNIQUE INDEX IF NOT EXISTS bot_commands_account_idempotency_idx
      ON bot_commands(account_id,idempotency_key) WHERE idempotency_key IS NOT NULL;
    CREATE INDEX IF NOT EXISTS bot_commands_account_pending_idx
      ON bot_commands(account_id,status,created_at) WHERE status IN ('pending','processing');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS bot_account_runtime_state (
  account_id UUID PRIMARY KEY REFERENCES bot_accounts(id) ON DELETE CASCADE,
  status VARCHAR(24) NOT NULL DEFAULT 'stopped',
  current_task VARCHAR(32) NOT NULL DEFAULT 'idle',
  desired_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  last_error TEXT,
  started_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status_payload JSONB NOT NULL DEFAULT '{}'::jsonb
);
