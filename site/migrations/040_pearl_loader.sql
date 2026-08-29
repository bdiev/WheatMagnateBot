ALTER TABLE bot_accounts
  ADD COLUMN IF NOT EXISTS role VARCHAR(32) NOT NULL DEFAULT 'general';

DO $$ BEGIN
  ALTER TABLE bot_accounts
    ADD CONSTRAINT bot_accounts_role_check
    CHECK (role IN ('general', 'pearl_loader'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS bot_accounts_one_pearl_loader_idx
  ON bot_accounts(role)
  WHERE role = 'pearl_loader' AND deleted_at IS NULL;

ALTER TABLE player_activity
  ADD COLUMN IF NOT EXISTS pearl_hatch_x INTEGER,
  ADD COLUMN IF NOT EXISTS pearl_hatch_y INTEGER,
  ADD COLUMN IF NOT EXISTS pearl_hatch_z INTEGER;

DO $$ BEGIN
  ALTER TABLE player_activity
    ADD CONSTRAINT player_activity_pearl_hatch_complete_check
    CHECK (
      (pearl_hatch_x IS NULL AND pearl_hatch_y IS NULL AND pearl_hatch_z IS NULL)
      OR
      (pearl_hatch_x IS NOT NULL AND pearl_hatch_y IS NOT NULL AND pearl_hatch_z IS NOT NULL)
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
