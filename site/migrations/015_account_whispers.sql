DO $$ BEGIN
  IF to_regclass('public.site_whisper_messages') IS NOT NULL THEN
    ALTER TABLE site_whisper_messages ADD COLUMN IF NOT EXISTS account_id UUID;
    UPDATE site_whisper_messages SET account_id='00000000-0000-4000-8000-000000000001'::uuid WHERE account_id IS NULL;
    ALTER TABLE site_whisper_messages ALTER COLUMN account_id SET DEFAULT '00000000-0000-4000-8000-000000000001'::uuid;
    ALTER TABLE site_whisper_messages ALTER COLUMN account_id SET NOT NULL;
    CREATE INDEX IF NOT EXISTS site_whisper_messages_account_player_idx ON site_whisper_messages(account_id,LOWER(player_username),created_at DESC);
  END IF;
  IF to_regclass('public.site_whisper_read_state') IS NOT NULL THEN
    ALTER TABLE site_whisper_read_state ADD COLUMN IF NOT EXISTS account_id UUID;
    UPDATE site_whisper_read_state SET account_id='00000000-0000-4000-8000-000000000001'::uuid WHERE account_id IS NULL;
    ALTER TABLE site_whisper_read_state ALTER COLUMN account_id SET DEFAULT '00000000-0000-4000-8000-000000000001'::uuid;
    ALTER TABLE site_whisper_read_state ALTER COLUMN account_id SET NOT NULL;
    ALTER TABLE site_whisper_read_state DROP CONSTRAINT IF EXISTS site_whisper_read_state_pkey;
    ALTER TABLE site_whisper_read_state ADD PRIMARY KEY(site_user_id,account_id,player_key);
  END IF;
END $$;
