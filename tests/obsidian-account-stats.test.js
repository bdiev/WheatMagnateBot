'use strict';

const assert = require('node:assert/strict');
const {
  recordManagedObsidianMined,
  recordManagedPickaxeRetired,
  saveManagedObsidianSupplies,
  syncManagedFarmState
} = require('../database/obsidian-account-stats');

const accountId = '00000000-0000-4000-8000-000000000002';

async function main() {
  const queries = [];
  const client = {
    query: async (sql, params = []) => { queries.push({ sql:String(sql), params }); return { rows:[] }; },
    release: () => { queries.push({ sql:'RELEASE', params:[] }); }
  };
  const pool = {
    connect: async () => client,
    query: async (sql, params = []) => { queries.push({ sql:String(sql), params }); return { rows:[] }; }
  };

  await recordManagedObsidianMined(pool, accountId);
  assert.match(queries[1].sql, /ON CONFLICT\(account_id\)/, 'farm totals are isolated by account');
  assert.match(queries[2].sql, /ON CONFLICT\(account_id,farm_date\)/, 'daily totals are isolated by account and day');
  assert.match(queries[3].sql, /ON CONFLICT\(account_id,bucket\)/, 'hourly totals are isolated by account and hour');
  assert.equal(queries[1].params[0], accountId);

  queries.length = 0;
  await recordManagedPickaxeRetired(pool, accountId, {
    name:'diamond_pickaxe', blocksMined:1200, countInAverage:true, maxDurability:1561, remainingPercent:25
  });
  assert.deepEqual(queries[1].params.slice(0, 3), [accountId, 1, 1200]);
  assert.equal(queries[2].params[1], 'diamond_pickaxe');
  assert.equal(queries[2].params[2], 1200);
  assert.ok(queries[2].params[3] > 0, 'durability consumption is retained for aggregate efficiency');

  queries.length = 0;
  await saveManagedObsidianSupplies(pool, accountId, { observedAt:'2026-08-12T18:00:00.000Z', inventory:{ allItems:[] } });
  assert.match(queries[1].sql, /obsidian_account_farm_supply_snapshot/);
  assert.match(queries[2].sql, /obsidian_account_farm_supply_history/);

  queries.length = 0;
  await syncManagedFarmState(pool, accountId, { desiredEnabled:true });
  assert.match(queries[1].sql, /WHEN EXCLUDED\.desired_enabled AND NOT obsidian_account_farm_state\.desired_enabled THEN 0/,
    'a new managed farming session resets only that account session counter');

  await assert.rejects(() => recordManagedObsidianMined(pool, 'not-a-uuid'), /valid Minecraft account ID/);
  console.log('Obsidian account statistics tests passed.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
