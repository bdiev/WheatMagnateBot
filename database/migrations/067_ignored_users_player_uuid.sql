-- Ignore entries used to be bare names, so a member who renamed lost access
-- and whoever took the freed name inherited it. Entries now carry the player's
-- UUID; the name column only mirrors the current name for display.
-- On a fresh database the table is created after migrations run, and the bot
-- and site add the column and indexes themselves at startup.
DO $$ BEGIN
  IF to_regclass('public.ignored_users') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE ignored_users ADD COLUMN IF NOT EXISTS player_uuid UUID;

  IF to_regclass('public.player_activity') IS NOT NULL THEN
    -- Bind each name to the UUID observed under it right now. When nobody is
    -- observed under the name, fall back to a name history that names exactly
    -- one player; ambiguous names stay unbound and keep matching by name.
    WITH candidates AS (
      SELECT DISTINCT ON (entry.id) entry.id, activity.player_uuid
      FROM ignored_users entry
      JOIN player_activity activity
        ON activity.player_uuid IS NOT NULL
       AND LOWER(activity.username) = LOWER(entry.username)
      WHERE entry.player_uuid IS NULL
      ORDER BY entry.id, activity.is_online DESC,
               COALESCE(activity.last_seen, activity.last_online) DESC NULLS LAST, activity.id DESC
    ), unique_candidates AS (
      SELECT DISTINCT ON (player_uuid) id, player_uuid
      FROM candidates
      WHERE NOT EXISTS (SELECT 1 FROM ignored_users bound WHERE bound.player_uuid = candidates.player_uuid)
      ORDER BY player_uuid, id
    )
    UPDATE ignored_users entry
    SET player_uuid = unique_candidates.player_uuid
    FROM unique_candidates
    WHERE entry.id = unique_candidates.id;
  END IF;

  IF to_regclass('public.player_name_history') IS NOT NULL THEN
    WITH unambiguous_names AS (
      SELECT LOWER(username) AS username_key, MIN(player_uuid::text)::uuid AS player_uuid
      FROM player_name_history
      GROUP BY LOWER(username)
      HAVING COUNT(DISTINCT player_uuid) = 1
    ), unique_candidates AS (
      SELECT DISTINCT ON (names.player_uuid) entry.id, names.player_uuid
      FROM ignored_users entry
      JOIN unambiguous_names names ON names.username_key = LOWER(entry.username)
      WHERE entry.player_uuid IS NULL
        AND NOT EXISTS (SELECT 1 FROM ignored_users bound WHERE bound.player_uuid = names.player_uuid)
      ORDER BY names.player_uuid, entry.id
    )
    UPDATE ignored_users entry
    SET player_uuid = unique_candidates.player_uuid
    FROM unique_candidates
    WHERE entry.id = unique_candidates.id;
  END IF;

  -- Two names can resolve to the same player (an old name and the current
  -- one). Keep the oldest entry for each UUID.
  DELETE FROM ignored_users newer
  USING ignored_users older
  WHERE newer.player_uuid = older.player_uuid
    AND newer.id > older.id;

  ALTER TABLE ignored_users DROP CONSTRAINT IF EXISTS ignored_users_username_key;
  IF to_regclass('public.player_activity') IS NOT NULL THEN
    UPDATE ignored_users entry
    SET username = activity.username
    FROM player_activity activity
    WHERE entry.player_uuid IS NOT NULL
      AND activity.player_uuid = entry.player_uuid
      AND entry.username IS DISTINCT FROM activity.username;
  END IF;

  -- Names are unique only among entries that are not bound yet: a bound
  -- entry's stored name can briefly lag behind a rename.
  DROP INDEX IF EXISTS ignored_users_username_lower_idx;
  ALTER TABLE ignored_users DROP CONSTRAINT IF EXISTS ignored_users_username_key;
  CREATE UNIQUE INDEX IF NOT EXISTS ignored_users_player_uuid_unique_idx
    ON ignored_users (player_uuid) WHERE player_uuid IS NOT NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS ignored_users_legacy_username_lower_idx
    ON ignored_users (LOWER(username)) WHERE player_uuid IS NULL;
END $$;
