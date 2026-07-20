'use strict';

const DEFAULT_ACCOUNT_ID = '00000000-0000-4000-8000-000000000001';
const ACCOUNT_SCOPED_TABLES = [
  'bot_status_snapshots','bot_commands','admin_settings','obsidian_farm_state','obsidian_farm_daily',
  'obsidian_farm_hourly','obsidian_farm_supply_snapshot','nearby_player_sightings','bot_tps_samples',
  'game_chat_messages','inventory_snapshots','farm_history','site_system_logs'
];

async function ensureAccountColumns(pool) {
  for (const table of ACCOUNT_SCOPED_TABLES) {
    const exists = await pool.query('SELECT to_regclass($1) AS name',[`public.${table}`]);
    if (!exists.rows[0]?.name) continue;
    await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS account_id UUID`);
    await pool.query(`UPDATE ${table} SET account_id=$1::uuid WHERE account_id IS NULL`,[DEFAULT_ACCOUNT_ID]);
    await pool.query(`ALTER TABLE ${table} ALTER COLUMN account_id SET DEFAULT '${DEFAULT_ACCOUNT_ID}'::uuid`);
    await pool.query(`ALTER TABLE ${table} ALTER COLUMN account_id SET NOT NULL`);
    await pool.query(`CREATE INDEX IF NOT EXISTS ${table}_account_idx ON ${table}(account_id)`);
  }
}

module.exports = { ACCOUNT_SCOPED_TABLES, DEFAULT_ACCOUNT_ID, ensureAccountColumns };
