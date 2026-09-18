-- The playtime leaderboard sums player_playtime rows left behind by earlier
-- usernames (player_uuid IS NULL) by matching on LOWER(username). Without an
-- index that lookup falls back to a sequential scan of the whole table.
CREATE INDEX IF NOT EXISTS player_playtime_legacy_username_idx
  ON player_playtime (LOWER(username))
  WHERE player_uuid IS NULL;
