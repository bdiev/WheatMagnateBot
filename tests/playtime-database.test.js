'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { PGlite } = require('@electric-sql/pglite');
const { createPlaytimeFeature } = require('../features/playtime');
const { createPlayerInfoObservationStore } = require('../features/playerInfoObservationStore');

async function run() {
  const db = new PGlite();
  const start = Date.parse('2026-09-06T12:00:00Z');
  let now = start;
  // Freeze only the database clock; execute the real tracking/import SQL.
  const query = (sql, params = []) => db.query(
    sql.replace(/NOW\(\)/g, `TIMESTAMPTZ '${new Date(now).toISOString()}'`), params
  );
  const pool = { query, connect: async () => ({ query, release() {} }) };
  const feature = createPlaytimeFeature({ pool, getOnlinePlayerUsernames: () => [] });
  const store = createPlayerInfoObservationStore({ pool, now: () => new Date(now) });
  const source = fs.readFileSync(path.join(__dirname, '../bot.js'), 'utf8');
  const reconcileSource = source.match(/async function reconcileObservedPlaytime\([^\n]*\) \{[\s\S]*?\n\}(?=\r?\n\r?\nasync function reconcileObservedJoinDate)/)?.[0];
  assert.ok(reconcileSource);
  const errors = [];
  const reconcile = vm.runInNewContext(`(${reconcileSource})`, {
    pool, playerInfoObservationStore: store, formatPlaytime: feature.formatPlaytime,
    console: { log() {}, error: (...args) => errors.push(args) }
  });
  const row = async name => (await query(`
    SELECT total_seconds::int AS saved, tracking_since,
           (total_seconds + CASE WHEN tracking_since IS NULL THEN 0
             ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - tracking_since)))) END)::int AS total
    FROM player_playtime WHERE LOWER(username) = LOWER($1)
  `, [name])).rows[0];
  try {
    await db.exec(`
      CREATE TABLE player_activity (
        id SERIAL PRIMARY KEY, username TEXT, player_uuid UUID, is_online BOOLEAN DEFAULT FALSE,
        last_seen TIMESTAMPTZ, last_online TIMESTAMPTZ, registration_at TIMESTAMPTZ
      );
      CREATE TABLE player_name_history (username TEXT, player_uuid UUID);
      CREATE TABLE player_playtime (
        username TEXT PRIMARY KEY, player_uuid UUID, total_seconds BIGINT NOT NULL DEFAULT 0,
        tracking_since TIMESTAMPTZ, updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE UNIQUE INDEX playtime_name ON player_playtime (LOWER(username));
      CREATE UNIQUE INDEX playtime_uuid ON player_playtime (player_uuid) WHERE player_uuid IS NOT NULL;
      CREATE TABLE player_info_observation_state (
        metric TEXT, identity_key TEXT, username TEXT, imported BOOLEAN,
        refresh_requested_at TIMESTAMPTZ, updated_at TIMESTAMPTZ, PRIMARY KEY (metric, identity_key)
      );
    `);

    await reconcile('ShortSession', 45);
    assert.equal((await row('ShortSession'))?.total, 45, 'the first PT under one minute must be stored');
    await reconcile('ZeroSession', 0);
    assert.equal((await row('ZeroSession'))?.total, 0, 'a confirmed zero must create a PT record');

    await feature.syncWhitelistPlaytime(['ShortSession', 'SHORTSESSION']);
    now = start + 30_400;
    await feature.syncWhitelistPlaytime(['ShortSession']);
    assert.equal((await row('ShortSession')).saved, 75);
    now = start + 60_800;
    await feature.syncWhitelistPlaytime(['ShortSession']);
    assert.equal((await row('ShortSession')).saved, 105);
    now = start + 61_200;
    await feature.syncWhitelistPlaytime(['ShortSession']);
    assert.equal((await row('ShortSession')).saved, 106, 'checkpoints must retain fractional seconds');
    await feature.syncWhitelistPlaytime(['AnotherPlayer']);
    assert.equal((await row('ShortSession')).tracking_since, null, 'a departed player stops accumulating');
    now += 3_600_000;
    assert.equal((await row('ShortSession')).total, 106, 'offline time must not count');
    await feature.syncWhitelistPlaytime(['ShortSession']);
    now += 10_000;
    assert.equal((await row('ShortSession')).total, 116, 'rejoining resumes from the stored total');
    const skipped = await feature.syncWhitelistPlaytime([]);
    assert.equal(skipped.reason, 'empty-snapshot');
    assert.ok((await row('ShortSession')).tracking_since, 'a transient empty TAB must not end the session');
    await feature.syncWhitelistPlaytime([], { allowEmptySnapshot: true });
    now += 60_000;
    assert.equal((await row('ShortSession')).total, 116, 'disconnect finalization must stop all timers');

    await reconcile('ShortSession', 9000);
    assert.equal((await row('ShortSession')).total, 116, 'an unsolicited repeat must not overwrite tracked PT');
    await feature.syncWhitelistPlaytime(['ShortSession']);
    await store.requestRefresh('playtime', 'ShortSession');
    await reconcile('ShortSession', 9000);
    assert.equal((await row('ShortSession')).total, 9000, 'refresh replaces the total without adding the old session');
    now += 10_000;
    assert.equal((await row('ShortSession')).total, 9010, 'tracking continues after refresh');
    const beforeRoundedReply = await row('ShortSession');
    await store.requestRefresh('playtime', 'ShortSession');
    await reconcile('ShortSession', 9000);
    assert.deepEqual(await row('ShortSession'), beforeRoundedReply,
      'minute-rounded replies must preserve an existing accurate timer');

    const uuid = 'fb1553da-5f6f-4d61-a96f-955f4e7e1f79';
    await query('INSERT INTO player_activity (username, player_uuid) VALUES ($1,$2)', ['CurrentName', uuid]);
    await query('INSERT INTO player_name_history VALUES ($1,$2), ($3,$2)', ['OldName', uuid, 'CurrentName']);
    await reconcile('OldName', 1000);
    assert.equal((await row('CurrentName')).total, 1000, 'old nicknames must import into the UUID-owned row');
    await feature.syncWhitelistPlaytime(['CurrentName']);
    now += 15_000;
    await feature.syncWhitelistPlaytime(['CurrentName']);
    assert.equal((await row('CurrentName')).total, 1015);
    await feature.setPlayerPlaytime('OldName', 2000);
    assert.equal((await row('CurrentName')).total, 2000, 'Discord/manual imports must reset the active baseline too');
    assert.equal((await query('SELECT COUNT(*)::int AS n FROM player_playtime WHERE player_uuid=$1', [uuid])).rows[0].n, 1);
    assert.deepEqual(errors, [], 'imports must not conceal database errors');
    console.log('Playtime database tests passed.');
  } finally {
    await db.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
