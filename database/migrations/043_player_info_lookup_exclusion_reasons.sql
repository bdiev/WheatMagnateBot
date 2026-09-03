ALTER TABLE player_info_lookup_exclusions
  DROP CONSTRAINT IF EXISTS player_info_lookup_exclusions_reason_check;

ALTER TABLE player_info_lookup_exclusions
  ADD CONSTRAINT player_info_lookup_exclusions_reason_check
  CHECK (reason IN ('user_not_found', 'join_date_null'));
