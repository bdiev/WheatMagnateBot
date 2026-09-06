'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { PGlite } = require('@electric-sql/pglite');
const { createPlayerInfoObservationStore } = require('../features/playerInfoObservationStore');

const root = path.resolve(__dirname, '..');
const siteSource = fs.readFileSync(path.join(root, 'site', 'server.js'), 'utf8');
const botSource = fs.readFileSync(path.join(root, 'bot.js'), 'utf8');
const databaseSource = fs.readFileSync(path.join(root, 'database', 'index.js'), 'utf8');

// Execute the production SQL and reconciliation function against Postgres so
// identity matching, timestamp boundaries and writable CTEs are exercised.
const profileSql = siteSource.match(
  /pool\.query\(`(\s*WITH message_baseline AS[\s\S]*?)`, \[playerUuid, aliases\]\)/
)?.[1];
assert.ok(profileSql, 'the production profile message-count query must be available');
const reconcileSource = botSource.match(
  /async function reconcileObservedMessages\([^\n]*\) \{[\s\S]*?\n\}(?=\r?\n\r?\nasync function reconcileObservedLastSeen)/
)?.[0];
assert.ok(reconcileSource, 'the production message reconciliation function must be available');
const mergeSql = databaseSource.match(
  /executor\.query\(`(\s*UPDATE player_activity target[\s\S]*?)`, \[uuidRow\.id, nameRow\.id\]\)/
)?.[1];
assert.ok(mergeSql, 'the production player identity merge query must be available');

const PLAYER_UUID = 'fb1553da-5f6f-4d61-a96f-955f4e7e1f79';
const OTHER_UUID = '11111111-1111-4111-8111-111111111111';
const CUTOFF = '2026-09-06T12:00:00.000Z';

async function createHarness() {
  const database = new PGlite();
  await database.exec(`
    CREATE TABLE player_activity (
      id BIGSERIAL PRIMARY KEY,
      username TEXT NOT NULL,
      player_uuid UUID,
      last_seen TIMESTAMPTZ,
      last_online TIMESTAMPTZ,
      registration_at TIMESTAMPTZ,
      is_online BOOLEAN NOT NULL DEFAULT FALSE,
      observed_message_count BIGINT CHECK (observed_message_count >= 0),
      observed_message_count_at TIMESTAMPTZ,
      admin_notes TEXT,
      admin_tags TEXT[] NOT NULL DEFAULT '{}',
      pearl_hatch_x INTEGER,
      pearl_hatch_y INTEGER,
      pearl_hatch_z INTEGER
    );
    CREATE UNIQUE INDEX player_activity_username_lower_unique_idx
      ON player_activity (LOWER(username));
    CREATE TABLE player_name_history (
      player_uuid UUID NOT NULL,
      username TEXT NOT NULL,
      PRIMARY KEY (player_uuid, username)
    );
    CREATE TABLE game_chat_messages (
      id BIGSERIAL PRIMARY KEY,
      username TEXT NOT NULL,
      player_uuid UUID,
      message TEXT NOT NULL DEFAULT 'A chat message',
      message_count INTEGER NOT NULL DEFAULT 1,
      is_visible BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE player_info_observation_state (
      metric TEXT NOT NULL CHECK (metric IN ('playtime', 'messages', 'joinDate')),
      identity_key TEXT NOT NULL,
      username TEXT NOT NULL,
      imported BOOLEAN NOT NULL DEFAULT FALSE,
      refresh_requested_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (metric, identity_key)
    );
  `);
  const query = (sql, params = []) => database.query(sql, params);
  const client = { query, release() {} };
  const pool = { query, connect: async () => client };
  const store = createPlayerInfoObservationStore({ pool });
  const reconcile = vm.runInNewContext(`(${reconcileSource})`, {
    pool,
    playerInfoObservationStore: store,
    console: { log() {}, error: console.error },
    Date
  });

  async function reset() {
    await database.exec(`
      TRUNCATE player_activity, player_name_history, game_chat_messages,
               player_info_observation_state RESTART IDENTITY;
    `);
  }

  async function player(username, uuid = null, count = null, cutoff = null) {
    const result = await query(`
      INSERT INTO player_activity
        (username, player_uuid, observed_message_count, observed_message_count_at)
      VALUES ($1, $2::uuid, $3::bigint, $4::timestamptz)
      RETURNING id
    `, [username, uuid, count, cutoff]);
    return result.rows[0].id;
  }

  async function chat(username, {
    uuid = null, count = 1, visible = true, at = CUTOFF, offsetMs = 0
  } = {}) {
    await query(`
      INSERT INTO game_chat_messages
        (username, player_uuid, message_count, is_visible, created_at)
      VALUES ($1, $2::uuid, $3, $4, $5::timestamptz + $6 * INTERVAL '1 millisecond')
    `, [username, uuid, count, visible, at, offsetMs]);
  }

  async function total(uuid, aliases) {
    const result = await query(profileSql, [uuid, aliases.map(name => name.toLowerCase())]);
    assert.equal(result.rows.length, 1, 'even absent players return one aggregate row');
    return Number(result.rows[0].total);
  }

  async function baseline(username) {
    const result = await query(`
      SELECT username, player_uuid, observed_message_count::text AS count,
             observed_message_count_at::text AS cutoff
      FROM player_activity WHERE LOWER(username) = LOWER($1)
    `, [username]);
    return result.rows[0];
  }

  return { database, query, store, reconcile, reset, player, chat, total, baseline };
}

async function testReportedCounterAndIdentity(harness) {
  const { player, chat, total } = harness;
  await player('manikmuptezel', PLAYER_UUID, 53_287, CUTOFF);
  await chat('manikmuptezel', { uuid: PLAYER_UUID, count: 20, offsetMs: -1 });
  await chat('manikmuptezel', { uuid: PLAYER_UUID, count: 30 });
  assert.equal(await total(PLAYER_UUID, ['manikmuptezel']), 53_287,
    'archived messages before or exactly at the imported snapshot must not be counted twice');
  await chat('manikmuptezel', { uuid: PLAYER_UUID, offsetMs: 1 });
  assert.equal(await total(PLAYER_UUID, ['manikmuptezel']), 53_288,
    'one newly archived message must advance the reported frozen 53,287 total');
  await chat('manikmuptezel', { uuid: PLAYER_UUID, visible: false, offsetMs: 2 });
  await chat('manikmuptezel', { uuid: PLAYER_UUID, count: 7, visible: false, offsetMs: 3 });
  assert.equal(await total(PLAYER_UUID, ['manikmuptezel']), 53_296,
    'hidden messages and flood summaries must contribute their complete statistical weight');
  await chat('OldPlayerName', { uuid: PLAYER_UUID, count: 3, offsetMs: 4 });
  await chat('OLDPLAYERNAME', { count: 4, offsetMs: 5 });
  await chat('manikmuptezel', { uuid: OTHER_UUID, count: 100, offsetMs: 6 });
  await chat('Unrelated', { count: 100, offsetMs: 7 });
  assert.equal(await total(PLAYER_UUID, ['manikmuptezel', 'OldPlayerName']), 53_303,
    'UUID history and case-insensitive UUID-less aliases count, but another UUID never does');
}

async function testArchiveFallbacks(harness) {
  const { reset, player, chat, total } = harness;
  await reset();
  await player('Unobserved', PLAYER_UUID);
  await chat('Unobserved', { uuid: PLAYER_UUID, count: 10, offsetMs: -1 });
  await chat('OldUnobserved', { count: 5, visible: false });
  await chat('Unobserved', { uuid: OTHER_UUID, count: 100 });
  assert.equal(await total(PLAYER_UUID, ['Unobserved', 'OldUnobserved']), 15,
    'an activity row without an imported baseline uses its complete archive');
  await chat('Ghost', { count: 2, offsetMs: -1 });
  await chat('GHOST', { count: 5, visible: false });
  assert.equal(await total(null, ['Ghost']), 7,
    'a player with no activity row still uses the case-insensitive archive');
  assert.equal(await total(null, ['Missing']), 0,
    'a player with no profile or messages has a zero total');
}

async function testImportsAndRefresh(harness) {
  const { reset, query, player, chat, total, baseline, reconcile, store } = harness;
  await reset();
  await player('manikmuptezel', PLAYER_UUID);
  await query(`INSERT INTO player_name_history (player_uuid, username)
    VALUES ($1::uuid, 'OldPlayerName'), ($1::uuid, 'manikmuptezel')`, [PLAYER_UUID]);
  await chat('OldPlayerName', { uuid: PLAYER_UUID, count: 200, at: '2000-01-01' });
  const imported = await reconcile('OldPlayerName', 53_287);
  assert.equal(imported.username, 'manikmuptezel', 'an old nickname imports into its canonical UUID');
  assert.equal(imported.unchanged, false);
  const first = await baseline('manikmuptezel');
  assert.equal(first.count, '53287');
  assert.ok(first.cutoff, 'an accepted observation must store its snapshot timestamp');
  assert.equal(await total(PLAYER_UUID, ['manikmuptezel', 'OldPlayerName']), 53_287,
    'importing an absolute server counter replaces the historical archive total');

  // Model a previously accepted observation without timers or relying on two
  // adjacent queries landing in distinct wall-clock milliseconds.
  await query(`UPDATE player_activity
    SET observed_message_count_at = NOW() - INTERVAL '1 hour'
    WHERE player_uuid = $1::uuid`, [PLAYER_UUID]);
  const previous = await baseline('manikmuptezel');
  await chat('manikmuptezel', { uuid: PLAYER_UUID, at: previous.cutoff, offsetMs: 1 });
  const repeated = await reconcile('manikmuptezel', 99_999);
  assert.equal(repeated.unchanged, true,
    'ordinary repeated server replies must not replace the once-imported baseline');
  assert.deepEqual(await baseline('manikmuptezel'), previous,
    'a denied observation must preserve both the count and snapshot timestamp');
  assert.equal(await total(PLAYER_UUID, ['manikmuptezel']), 53_288);

  await store.requestRefresh('messages', 'OldPlayerName');
  assert.deepEqual(await baseline('manikmuptezel'), previous,
    'requesting a refresh alone must not move the counting boundary');
  const refreshed = await reconcile('manikmuptezel', 60_000);
  assert.equal(refreshed.unchanged, false);
  const current = await baseline('manikmuptezel');
  assert.equal(current.count, '60000');
  assert.ok(new Date(current.cutoff) > new Date(previous.cutoff),
    'an explicitly accepted refresh advances the snapshot boundary');
  assert.equal(await total(PLAYER_UUID, ['manikmuptezel', 'OldPlayerName']), 60_000,
    'messages already included in a refreshed server total must not be added again');
  await chat('manikmuptezel', { uuid: PLAYER_UUID, at: current.cutoff, offsetMs: 1 });
  assert.equal(await total(PLAYER_UUID, ['manikmuptezel']), 60_001,
    'counting continues after a manual refresh');
  assert.equal((await reconcile('OldPlayerName', 61_000)).unchanged, true,
    'one refresh request permits exactly one update across all aliases');
  assert.deepEqual(await baseline('manikmuptezel'), current);
}

async function testNameOnlyAndNewZeroPlayer(harness) {
  const { reset, player, chat, total, baseline, reconcile } = harness;
  await reset();
  await player('NameOnly');
  assert.equal((await reconcile('NAMEONLY', 25)).unchanged, false);
  const named = await baseline('NameOnly');
  assert.equal(named.count, '25', 'an existing UUID-less row supports the name update branch');
  assert.ok(named.cutoff);
  assert.equal(await total(null, ['NameOnly']), 25);

  assert.equal((await reconcile('BrandNew', 0)).unchanged, false);
  const inserted = await baseline('BrandNew');
  assert.equal(inserted.count, '0', 'a confirmed zero creates an imported baseline for a new player');
  assert.ok(inserted.cutoff, 'the insert branch must store the same count/timestamp pair');
  await chat('BrandNew', { at: inserted.cutoff, offsetMs: 1 });
  assert.equal(await total(null, ['BrandNew']), 1, 'a confirmed zero total must grow with new chat');
  assert.equal((await reconcile('BrandNew', 0)).unchanged, true);
  assert.equal(await total(null, ['BrandNew']), 1, 'repeated zero replies must not erase new messages');
}

async function testIdentityMergeKeepsBaselinePair(harness) {
  const { reset, query, player, baseline } = harness;
  await reset();
  const targetId = await player('UuidOwner', PLAYER_UUID);
  const sourceId = await player('NameOwner', null, 72, CUTOFF);
  await query(mergeSql, [targetId, sourceId]);
  const adopted = await baseline('UuidOwner');
  assert.equal(adopted.count, '72');
  assert.equal(new Date(adopted.cutoff).toISOString(), CUTOFF,
    'a UUID row without a baseline must inherit the source count and timestamp together');

  await query(`UPDATE player_activity
    SET observed_message_count = 900,
        observed_message_count_at = '2026-09-07T12:00:00Z'
    WHERE id = $1`, [sourceId]);
  await query(mergeSql, [targetId, sourceId]);
  assert.deepEqual(await baseline('UuidOwner'), adopted,
    'an established UUID baseline must retain its own count and matching timestamp');

  await query('UPDATE player_activity SET observed_message_count = 0 WHERE id = $1', [targetId]);
  await query(mergeSql, [targetId, sourceId]);
  const confirmedZero = await baseline('UuidOwner');
  assert.equal(confirmedZero.count, '0', 'an imported zero is an established baseline during identity merge');
  assert.equal(confirmedZero.cutoff, adopted.cutoff);
}

async function run() {
  const harness = await createHarness();
  try {
    await testReportedCounterAndIdentity(harness);
    await testArchiveFallbacks(harness);
    await testImportsAndRefresh(harness);
    await testNameOnlyAndNewZeroPlayer(harness);
    await testIdentityMergeKeepsBaselinePair(harness);
    console.log('Player message count database regression tests passed.');
  } finally {
    await harness.database.close();
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
