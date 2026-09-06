'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { PGlite } = require('@electric-sql/pglite');
const { createPlayerActivityRepository } = require('../database');

async function run() {
  const db = new PGlite();
  const root = path.resolve(__dirname, '..');
  const migration = fs.readFileSync(path.join(root, 'database/migrations/048_player_current_online_since.sql'), 'utf8');
  assert.equal(migration, fs.readFileSync(path.join(root, 'site/migrations/048_player_current_online_since.sql'), 'utf8'));
  try {
    await db.exec(`
      CREATE TABLE player_activity (
        id SERIAL PRIMARY KEY, username TEXT, player_uuid UUID, is_online BOOLEAN,
        last_seen TIMESTAMPTZ, last_online TIMESTAMPTZ, registration_at TIMESTAMPTZ
      );
      CREATE TABLE player_session_events (username TEXT, event_type TEXT, occurred_at TIMESTAMPTZ);
      CREATE TABLE whitelist (username TEXT);
      CREATE TABLE player_name_history (username TEXT, player_uuid UUID);
      CREATE TABLE player_playtime (username TEXT, player_uuid UUID, total_seconds BIGINT, tracking_since TIMESTAMPTZ);
      CREATE TABLE bot_accounts (id UUID, username TEXT, deleted_at TIMESTAMPTZ);
      CREATE TABLE bot_account_runtime_state (
        account_id UUID, status TEXT, started_at TIMESTAMPTZ, updated_at TIMESTAMPTZ, status_payload JSONB
      );
      INSERT INTO player_activity (username, is_online, last_seen, last_online)
      VALUES ('herobrineslord', TRUE, NOW() - INTERVAL '48 days', NOW() - INTERVAL '48 days');
    `);
    await db.exec(migration);
    await db.exec(migration);
    const pool = { query: (sql, params = []) => db.query(sql, params) };
    const repository = createPlayerActivityRepository({ pool });
    const activity = async () => (await db.query('SELECT * FROM player_activity')).rows[0];
    assert.equal((await activity()).online_since, null, 'migration must not reuse a historical join');

    await repository.updatePlayerActivity('herobrineslord', true, { recordEvent: false });
    assert.equal((await activity()).online_since, null, 'a TAB snapshot cannot establish the actual join time');
    await repository.updatePlayerActivity('herobrineslord', false);
    await repository.updatePlayerActivity('herobrineslord', true);
    const joined = await activity();
    assert.ok(joined.online_since, 'a confirmed join must start the online timer');
    assert.ok(Math.abs(Date.now() - new Date(joined.online_since)) < 5000);
    await repository.updatePlayerActivity('HEROBRINESLORD', true, { recordEvent: false });
    await repository.updatePlayerActivity('herobrineslord', true);
    assert.equal(+new Date((await activity()).online_since), +new Date(joined.online_since), 'snapshots and duplicate joins must preserve the timer');

    const serverSource = fs.readFileSync(path.join(root, 'site/server.js'), 'utf8');
    const searchSource = serverSource.match(/async function searchSeenPlayers\(url\) \{[\s\S]*?\n\}/)?.[0];
    assert.ok(searchSource);
    const search = vm.runInNewContext(`(${searchSource})`, {
      pool, assertDatabase() {}, toInt: Number, formatSeconds: String,
      playerProfileRuntimePresence: () => ({ isOnline: false, currentStartedAt: null }),
      sortSeenPlayers: players => players
    });
    const lookup = async () => (await search(new URL('http://localhost/api/seen-search?query=herobrineslord'))).players[0];
    assert.equal(+new Date((await lookup()).onlineSince), +new Date(joined.online_since), 'Seen API must return the confirmed session start');
    // Exercise both the legacy-name and UUID branches of the real search SQL.
    await db.exec("UPDATE player_activity SET player_uuid='11111111-1111-4111-8111-111111111111'");
    assert.equal(+new Date((await lookup()).onlineSince), +new Date(joined.online_since));

    await repository.updatePlayerActivity('herobrineslord', true, { recordEvent: false, resetSession: true });
    assert.equal((await activity()).online_since, null, 'initial TAB after reconnect must invalidate an unverified persisted session');
    assert.equal((await lookup()).onlineSince, null, 'Seen must not fall back to the old last_online');
    await repository.updatePlayerActivity('herobrineslord', false);
    await repository.updatePlayerActivity('herobrineslord', true);
    assert.ok((await activity()).online_since, 'the next observed join must restart the timer');
    await repository.updatePlayerActivity('herobrineslord', false, { recordEvent: false });
    assert.equal((await activity()).online_since, null, 'disconnect must invalidate the session start');
    assert.equal((await lookup()).onlineSince, null);

    const appSource = fs.readFileSync(path.join(root, 'site/public/app.js'), 'utf8');
    const statusSource = appSource.match(/function seenPlayerStatusText\(player, now = Date.now\(\)\) \{[\s\S]*?\n\}/)?.[0];
    const status = vm.runInNewContext(`(${statusSource})`, { formatDurationMs: ms => `${ms / 60000}m`, formatAgo: () => '2h ago' });
    const now = Date.parse('2026-09-06T12:00:00Z');
    const stalePlayer = { isOnline: true, lastOnline: '2026-07-19T13:52:00Z', onlineSince: null };
    assert.equal(status(stalePlayer, now), 'online now');
    assert.equal(status({ ...stalePlayer, onlineSince: '2026-09-06T11:50:00Z' }, now), 'online for 10m');
    assert.equal(status({ isOnline: false, lastSeen: '2026-09-06T10:00:00Z' }, now), '2h ago');
    const seenUi = appSource.slice(appSource.indexOf('function seenPlayerStatusText'), appSource.indexOf('async function runSeenSearch'));
    assert.doesNotMatch(seenUi, /player\.lastOnline/, 'neither the initial rendering nor the live timer may reuse lastOnline');
    console.log('Seen online session tests passed.');
  } finally {
    await db.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
