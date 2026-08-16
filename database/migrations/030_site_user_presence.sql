DO $$
BEGIN
  IF to_regclass('public.site_users') IS NOT NULL THEN
    ALTER TABLE site_users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
  END IF;

  IF to_regclass('public.site_sessions') IS NOT NULL THEN
    ALTER TABLE site_sessions ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;
    UPDATE site_sessions SET last_active_at=created_at WHERE last_active_at IS NULL;
    ALTER TABLE site_sessions ALTER COLUMN last_active_at SET DEFAULT NOW();
    ALTER TABLE site_sessions ALTER COLUMN last_active_at SET NOT NULL;

    IF to_regclass('public.site_users') IS NOT NULL THEN
      UPDATE site_users AS site_user
      SET last_seen_at=presence.last_active_at
      FROM (
        SELECT user_id,MAX(last_active_at) AS last_active_at
        FROM site_sessions
        GROUP BY user_id
      ) AS presence
      WHERE site_user.id=presence.user_id AND site_user.last_seen_at IS NULL;
    END IF;

    EXECUTE 'CREATE INDEX IF NOT EXISTS site_sessions_user_activity_idx ON site_sessions(user_id,last_active_at DESC)';
  END IF;
END $$;
