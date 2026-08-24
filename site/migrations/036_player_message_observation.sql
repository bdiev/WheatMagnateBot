ALTER TABLE player_activity
  ADD COLUMN IF NOT EXISTS observed_message_count BIGINT
  CHECK (observed_message_count >= 0);

ALTER TABLE player_info_observation_state
  DROP CONSTRAINT IF EXISTS player_info_observation_state_metric_check;

ALTER TABLE player_info_observation_state
  ADD CONSTRAINT player_info_observation_state_metric_check
  CHECK (metric IN ('playtime', 'messages', 'joinDate'));
