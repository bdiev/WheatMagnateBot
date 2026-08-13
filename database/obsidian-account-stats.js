'use strict';

function normalizeAccountId(accountId) {
  const value = String(accountId || '').trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)) {
    throw new Error('A valid Minecraft account ID is required for Obsidian statistics.');
  }
  return value;
}

function normalizeFarmConfig(value) {
  if (!value || typeof value !== 'object') return null;
  if ([value.x, value.y, value.z].some(coordinate => coordinate == null || coordinate === '')) return null;
  const x = Number(value.x);
  const y = Number(value.y);
  const z = Number(value.z);
  if (![x, y, z].every(Number.isFinite)) return null;
  const radius = Number(value.maxCauldronDist ?? value.radius);
  return {
    x:Math.round(x),
    y:Math.round(y),
    z:Math.round(z),
    maxCauldronDist:[4, 5, 6].includes(radius) ? radius : 5
  };
}

async function loadManagedFarmStates(pool) {
  if (!pool) return new Map();
  const result = await pool.query(`
    SELECT accounts.id AS account_id,
           stats.desired_enabled,
           stats.target_x,stats.target_y,stats.target_z,stats.target_radius,
           runtime.desired_enabled AS runtime_desired_enabled,
           runtime.status_payload
    FROM bot_accounts accounts
    LEFT JOIN obsidian_account_farm_state stats ON stats.account_id=accounts.id
    LEFT JOIN bot_account_runtime_state runtime ON runtime.account_id=accounts.id
    WHERE accounts.deleted_at IS NULL AND accounts.is_default=FALSE
  `);
  return new Map(result.rows.map(row => {
    const databaseConfig = normalizeFarmConfig({
      x:row.target_x,
      y:row.target_y,
      z:row.target_z,
      maxCauldronDist:row.target_radius
    });
    let payload = row.status_payload && typeof row.status_payload === 'object'
      ? row.status_payload
      : {};
    if (typeof row.status_payload === 'string') {
      try { payload = JSON.parse(row.status_payload); } catch {}
    }
    const snapshotConfig = normalizeFarmConfig(
      payload.modules?.obsidianFarm?.config || payload.obsidian?.config
    );
    return [String(row.account_id), {
      desiredEnabled:row.desired_enabled == null
        ? Boolean(row.runtime_desired_enabled)
        : Boolean(row.desired_enabled),
      config:databaseConfig || snapshotConfig
    }];
  }));
}

async function syncManagedFarmState(pool, accountId, farm = {}) {
  if (!pool) return;
  const id = normalizeAccountId(accountId);
  const desiredEnabled = Boolean(farm.desiredEnabled ?? farm.enabled);
  const config = normalizeFarmConfig(farm.config);
  const updateConfig = farm.config === null || Boolean(config);
  const previous = await pool.query(
    'SELECT desired_enabled FROM obsidian_account_farm_state WHERE account_id=$1::uuid',
    [id]
  );
  await pool.query(`
    INSERT INTO obsidian_account_farm_state(
      account_id,desired_enabled,session_started_at,target_x,target_y,target_z,target_radius,updated_at
    ) VALUES($1::uuid,$2,CASE WHEN $2 THEN NOW() ELSE NULL END,$4,$5,$6,$7,NOW())
    ON CONFLICT(account_id) DO UPDATE SET
      session_mined=CASE
        WHEN EXCLUDED.desired_enabled AND NOT obsidian_account_farm_state.desired_enabled THEN 0
        ELSE obsidian_account_farm_state.session_mined
      END,
      session_started_at=CASE
        WHEN EXCLUDED.desired_enabled AND NOT obsidian_account_farm_state.desired_enabled THEN NOW()
        ELSE obsidian_account_farm_state.session_started_at
      END,
      desired_enabled=EXCLUDED.desired_enabled,
      target_x=CASE WHEN $3 THEN EXCLUDED.target_x ELSE obsidian_account_farm_state.target_x END,
      target_y=CASE WHEN $3 THEN EXCLUDED.target_y ELSE obsidian_account_farm_state.target_y END,
      target_z=CASE WHEN $3 THEN EXCLUDED.target_z ELSE obsidian_account_farm_state.target_z END,
      target_radius=CASE WHEN $3 THEN EXCLUDED.target_radius ELSE obsidian_account_farm_state.target_radius END,
      updated_at=NOW()
  `, [id, desiredEnabled, updateConfig, config?.x ?? null, config?.y ?? null, config?.z ?? null, config?.maxCauldronDist ?? null]);
  if (previous.rows[0] && Boolean(previous.rows[0].desired_enabled) !== desiredEnabled) {
    await pool.query(`
      INSERT INTO obsidian_account_farm_annotations(account_id,event_type,title,details)
      VALUES($1::uuid,$2,$3,$4::jsonb)
    `, [
      id,
      desiredEnabled ? 'resume' : 'pause',
      desiredEnabled ? 'Farm resumed' : 'Farm paused',
      JSON.stringify({ source:'managed_runtime' })
    ]);
  }
}

async function recordManagedObsidianMined(pool, accountId) {
  if (!pool) return;
  const id = normalizeAccountId(accountId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      INSERT INTO obsidian_account_farm_state(
        account_id,session_mined,total_mined,desired_enabled,session_started_at,updated_at
      ) VALUES($1::uuid,1,1,TRUE,NOW(),NOW())
      ON CONFLICT(account_id) DO UPDATE SET
        session_mined=obsidian_account_farm_state.session_mined+1,
        total_mined=obsidian_account_farm_state.total_mined+1,
        desired_enabled=TRUE,
        session_started_at=COALESCE(obsidian_account_farm_state.session_started_at,NOW()),
        updated_at=NOW()
    `, [id]);
    await client.query(`
      INSERT INTO obsidian_account_farm_daily(account_id,farm_date,mined)
      VALUES(
        $1::uuid,
        (NOW() AT TIME ZONE COALESCE((SELECT timezone FROM obsidian_farm_analytics_settings WHERE id=1),'Europe/Vilnius'))::date,
        1
      )
      ON CONFLICT(account_id,farm_date) DO UPDATE SET
        mined=obsidian_account_farm_daily.mined+1,
        updated_at=NOW()
    `, [id]);
    await client.query(`
      INSERT INTO obsidian_account_farm_hourly(account_id,bucket,mined)
      VALUES($1::uuid,date_trunc('hour',NOW()),1)
      ON CONFLICT(account_id,bucket) DO UPDATE SET
        mined=obsidian_account_farm_hourly.mined+1,
        updated_at=NOW()
    `, [id]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function recordManagedPickaxeRetired(pool, accountId, details = {}) {
  if (!pool) return;
  const id = normalizeAccountId(accountId);
  const blocksMined = Math.max(0, Number(details.blocksMined) || 0);
  const remainingPercent = Number.isFinite(Number(details.remainingPercent)) ? Number(details.remainingPercent) : null;
  const durabilityUsed = Number(details.maxDurability) > 0 && remainingPercent != null
    ? Number(details.maxDurability) * Math.max(0, 100 - remainingPercent) / 100
    : null;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      INSERT INTO obsidian_account_farm_state(account_id,retired_pickaxes,retired_pickaxe_blocks,updated_at)
      VALUES($1::uuid,$2,$3,NOW())
      ON CONFLICT(account_id) DO UPDATE SET
        retired_pickaxes=obsidian_account_farm_state.retired_pickaxes+EXCLUDED.retired_pickaxes,
        retired_pickaxe_blocks=obsidian_account_farm_state.retired_pickaxe_blocks+EXCLUDED.retired_pickaxe_blocks,
        updated_at=NOW()
    `, [id, details.countInAverage ? 1 : 0, details.countInAverage ? blocksMined : 0]);
    await client.query(`
      INSERT INTO obsidian_account_farm_tool_usage(
        account_id,tool_name,blocks_mined,durability_used,remaining_percent
      ) VALUES($1::uuid,$2,$3,$4,$5)
    `, [id, String(details.name || 'pickaxe').slice(0, 80), blocksMined, durabilityUsed, remainingPercent]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function saveManagedObsidianSupplies(pool, accountId, supplies) {
  if (!pool || !supplies) return;
  const id = normalizeAccountId(accountId);
  const observedAt = supplies.observedAt ? new Date(supplies.observedAt) : new Date();
  const serialized = JSON.stringify(supplies);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      INSERT INTO obsidian_account_farm_supply_snapshot(account_id,supplies,observed_at,updated_at)
      VALUES($1::uuid,$2::jsonb,$3,NOW())
      ON CONFLICT(account_id) DO UPDATE SET
        supplies=EXCLUDED.supplies,
        observed_at=EXCLUDED.observed_at,
        updated_at=NOW()
    `, [id, serialized, observedAt]);
    await client.query(`
      INSERT INTO obsidian_account_farm_supply_history(account_id,supplies,observed_at)
      SELECT $1::uuid,$2::jsonb,$3
      WHERE NOT EXISTS(
        SELECT 1 FROM obsidian_account_farm_supply_history
        WHERE account_id=$1::uuid AND observed_at=$3
      )
    `, [id, serialized, observedAt]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  loadManagedFarmStates,
  recordManagedObsidianMined,
  recordManagedPickaxeRetired,
  saveManagedObsidianSupplies,
  syncManagedFarmState
};
