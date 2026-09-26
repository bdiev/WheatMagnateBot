-- The Player Data missing-command summary matches player_activity and
-- player_playtime rows by LOWER(username) for every tracked player. The only
-- existing playtime index is partial (legacy rows), so both lookups scanned
-- the whole table per player and the command list loaded slowly.
CREATE INDEX IF NOT EXISTS player_activity_username_lower_idx
  ON player_activity (LOWER(username));

CREATE INDEX IF NOT EXISTS player_playtime_username_lower_idx
  ON player_playtime (LOWER(username));
