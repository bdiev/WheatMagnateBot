BEGIN;

ALTER TABLE site_users
  ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user';

-- Preserve legacy accounts when adding the column to an older installation.
ALTER TABLE site_users
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'approved';

-- Only future inserts use the secure defaults; existing rows are not modified.
ALTER TABLE site_users ALTER COLUMN role SET DEFAULT 'user';
ALTER TABLE site_users ALTER COLUMN status SET DEFAULT 'pending';

COMMIT;
