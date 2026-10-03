-- The site's realtime poller reads these MAX()/online markers every tick.
-- Without matching indexes each tick scanned whole tables.
DO $$
BEGIN
  IF to_regclass('public.bot_commands') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS bot_commands_activity_at_idx
      ON bot_commands ((COALESCE(finished_at, started_at, created_at)));
  END IF;
  IF to_regclass('public.player_activity') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS player_activity_online_username_idx
      ON player_activity (LOWER(username)) WHERE is_online = TRUE;
  END IF;
  IF to_regclass('public.player_playtime') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS player_playtime_updated_at_idx ON player_playtime (updated_at);
  END IF;
  IF to_regclass('public.player_info_observation_state') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS player_info_observation_state_updated_at_idx
      ON player_info_observation_state (updated_at);
  END IF;
  IF to_regclass('public.player_info_lookup_exclusions') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS player_info_lookup_exclusions_updated_at_idx
      ON player_info_lookup_exclusions (updated_at);
  END IF;
  IF to_regclass('public.obsidian_farm_annotations') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS obsidian_farm_annotations_occurred_at_idx
      ON obsidian_farm_annotations (occurred_at);
  END IF;
END $$;
