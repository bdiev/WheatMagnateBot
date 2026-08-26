ALTER TABLE kill_aura_state
  ADD COLUMN IF NOT EXISTS attack_range NUMERIC(2,1) NOT NULL DEFAULT 3.0;

ALTER TABLE kill_aura_state
  DROP CONSTRAINT IF EXISTS kill_aura_state_attack_range_check;

ALTER TABLE kill_aura_state
  ADD CONSTRAINT kill_aura_state_attack_range_check
  CHECK (attack_range >= 0.5 AND attack_range <= 3.0);
