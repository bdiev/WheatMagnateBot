'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { createPlayerPingFeature, normalizePingSamples } = require('../features/playerPing');

async function run() {
  const samples = normalizePingSamples([
    { username: 'Alpha', uuid: '0f7c1a52-1b8a-4e8f-9f65-2c1f4a7f8d11', ping: 45 },
    { username: 'alpha', uuid: null, ping: 900 },
    { username: 'Bravo', uuid: 'not-a-uuid', ping: 120 },
    { username: 'Joining', ping: 0 },
    { username: 'Hidden', ping: 65535 },
    { username: 'Fraction', ping: 12.5 },
    { username: 'bad name!', ping: 50 },
    { username: 'WheatMagnate', ping: 30 }
  ], { excludeUsername: 'wheatmagnate' });
  assert.deepEqual(samples, [
    { username: 'Alpha', key: 'alpha', uuid: '0f7c1a52-1b8a-4e8f-9f65-2c1f4a7f8d11', ping: 45 },
    { username: 'Bravo', key: 'bravo', uuid: null, ping: 120 }
  ], 'duplicates, the bot itself and implausible readings must be dropped');

  const queries = [];
  const pool = {
    async query(sql, params = []) {
      queries.push({ sql, params });
      return { rows: [], rowCount: 0 };
    }
  };
  const feature = createPlayerPingFeature({
    pool,
    getPlayers: () => [{ username: 'Alpha', ping: 45 }, { username: 'Bravo', uuid: '0f7c1a52-1b8a-4e8f-9f65-2c1f4a7f8d11', ping: 210 }],
    getBotUsername: () => 'WheatMagnate',
    now: () => new Date('2026-09-23T12:34:56.000Z')
  });

  assert.deepEqual(await feature.sample(), { recorded: 2 });
  assert.match(queries[0].sql, /INSERT INTO player_ping_hourly/);
  assert.match(queries[0].sql, /ON CONFLICT \(username_key, hour_start\) DO UPDATE/);
  assert.deepEqual(queries[0].params, [
    ['alpha', 'bravo'],
    [45, 210],
    [null, '0f7c1a52-1b8a-4e8f-9f65-2c1f4a7f8d11'],
    '2026-09-23T12:34:56.000Z'
  ]);
  assert.match(queries[1].sql, /UPDATE player_activity pa/);
  assert.match(queries[2].sql, /DELETE FROM player_ping_hourly/, 'the first sample must prune old history');

  queries.length = 0;
  await feature.sample();
  assert.equal(queries.length, 2, 'retention pruning must not run on every sample');

  const idle = createPlayerPingFeature({ pool, getPlayers: () => [{ username: 'Joining', ping: 0 }] });
  queries.length = 0;
  assert.deepEqual(await idle.sample(), { recorded: 0 });
  assert.equal(queries.length, 0, 'an empty snapshot must not touch the database');

  await runAgainstPostgres();
  console.log('player ping feature tests passed');
}

async function runAgainstPostgres() {
  const db = new PGlite();
  let now = new Date('2026-09-23T12:10:00.000Z');
  const dbPool = { query: (sql, params = []) => db.query(sql, params) };
  try {
    await db.exec(`
      CREATE TABLE player_activity (id SERIAL PRIMARY KEY, username TEXT NOT NULL);
      INSERT INTO player_activity (username) VALUES ('Alpha'), ('Bravo');
    `);
    await db.exec(fs.readFileSync(path.join(__dirname, '../database/migrations/058_player_ping.sql'), 'utf8'));
    await db.query(`
      INSERT INTO player_ping_hourly (username_key, hour_start, sample_count, ping_sum, ping_min, ping_max)
      VALUES ('alpha', '2026-01-01T00:00:00Z', 1, 50, 50, 50)
    `);

    let players = [{ username: 'Alpha', ping: 40 }, { username: 'Bravo', uuid: '0f7c1a52-1b8a-4e8f-9f65-2c1f4a7f8d11', ping: 200 }];
    const feature = createPlayerPingFeature({ pool: dbPool, getPlayers: () => players, now: () => now });
    await feature.sample();
    now = new Date('2026-09-23T12:40:00.000Z');
    players = [{ username: 'Alpha', ping: 80 }];
    await feature.sample();

    const hourly = (await db.query(`
      SELECT username_key, hour_start, player_uuid, sample_count, ping_sum::int AS ping_sum, ping_min, ping_max
      FROM player_ping_hourly ORDER BY username_key
    `)).rows;
    assert.equal(hourly.length, 2, 'samples older than the retention window must be pruned');
    assert.deepEqual(
      hourly.map(row => [row.username_key, new Date(row.hour_start).toISOString(), row.sample_count, row.ping_sum, row.ping_min, row.ping_max]),
      [
        ['alpha', '2026-09-23T12:00:00.000Z', 2, 120, 40, 80],
        ['bravo', '2026-09-23T12:00:00.000Z', 1, 200, 200, 200]
      ],
      'samples within one hour must merge into a single aggregate row'
    );
    assert.equal(hourly[1].player_uuid, '0f7c1a52-1b8a-4e8f-9f65-2c1f4a7f8d11');

    const activity = (await db.query('SELECT username, last_ping_ms, last_ping_at FROM player_activity ORDER BY username')).rows;
    assert.equal(activity[0].last_ping_ms, 80);
    assert.equal(new Date(activity[0].last_ping_at).toISOString(), '2026-09-23T12:40:00.000Z');
    assert.equal(activity[1].last_ping_ms, 200, 'a player missing from a later snapshot keeps the last reading');
  } finally {
    await db.close();
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
