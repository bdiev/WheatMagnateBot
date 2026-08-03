CREATE TABLE IF NOT EXISTS resource_request_users (
  discord_id VARCHAR(32) PRIMARY KEY,
  discord_username VARCHAR(64) NOT NULL,
  discord_global_name VARCHAR(128),
  discord_avatar_hash VARCHAR(128),
  minecraft_username VARCHAR(16),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT resource_request_users_minecraft_username_check
    CHECK (minecraft_username IS NULL OR minecraft_username ~ '^[A-Za-z0-9_]{1,16}$')
);

CREATE TABLE IF NOT EXISTS resource_request_sessions (
  token_hash TEXT PRIMARY KEY,
  discord_id VARCHAR(32) NOT NULL REFERENCES resource_request_users(discord_id) ON DELETE CASCADE,
  csrf_token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS resource_request_sessions_discord_idx
  ON resource_request_sessions(discord_id);

CREATE TABLE IF NOT EXISTS resource_request_admin_sessions (
  token_hash TEXT PRIMARY KEY,
  site_user_id BIGINT NOT NULL,
  csrf_token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS resource_request_admin_sessions_user_idx
  ON resource_request_admin_sessions(site_user_id);

CREATE TABLE IF NOT EXISTS resource_requests (
  id BIGSERIAL PRIMARY KEY,
  requester_discord_id VARCHAR(32) NOT NULL REFERENCES resource_request_users(discord_id) ON DELETE RESTRICT,
  minecraft_username VARCHAR(16) NOT NULL,
  resources TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  delivery_coordinates VARCHAR(160),
  admin_note VARCHAR(500),
  delivery_command_id BIGINT,
  ready_at TIMESTAMPTZ,
  notified_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT resource_requests_minecraft_username_check
    CHECK (minecraft_username ~ '^[A-Za-z0-9_]{1,16}$'),
  CONSTRAINT resource_requests_status_check
    CHECK (status IN ('pending', 'preparing', 'ready', 'notified', 'completed', 'cancelled')),
  CONSTRAINT resource_requests_resources_check
    CHECK (char_length(resources) BETWEEN 3 AND 2000)
);

CREATE INDEX IF NOT EXISTS resource_requests_requester_created_idx
  ON resource_requests(requester_discord_id, created_at DESC);

CREATE INDEX IF NOT EXISTS resource_requests_status_created_idx
  ON resource_requests(status, created_at DESC);
