'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

async function run() {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TABLE player_activity (
        id SERIAL PRIMARY KEY,
        username TEXT,
        player_uuid UUID,
        registration_at TIMESTAMPTZ,
        last_seen TIMESTAMPTZ,
        last_online TIMESTAMPTZ,
        is_online BOOLEAN DEFAULT FALSE,
        observed_message_count BIGINT,
        observed_message_count_at TIMESTAMPTZ
      );
      CREATE TABLE player_name_history (username TEXT, player_uuid UUID);
      CREATE TABLE player_playtime (
        username TEXT,
        player_uuid UUID,
        total_seconds BIGINT,
        tracking_since TIMESTAMPTZ,
        updated_at TIMESTAMPTZ
      );
      CREATE TABLE game_chat_messages (
        username TEXT,
        player_uuid UUID,
        message_count INTEGER,
        created_at TIMESTAMPTZ
      );
      CREATE TABLE whitelist (id SERIAL PRIMARY KEY, username TEXT);

      INSERT INTO player_activity (
        username, player_uuid, registration_at, last_seen, is_online,
        observed_message_count, observed_message_count_at
      ) VALUES (
        'CurrentName', '11111111-1111-4111-8111-111111111111',
        '2020-02-03T04:05:06Z', NOW(), TRUE, 123400, '2026-01-01T00:00:00Z'
      );
      INSERT INTO player_activity (username, registration_at, last_seen, is_online)
      VALUES ('Dot5', '2015-01-01T00:00:00Z', NOW() - INTERVAL '1 day', FALSE);
      INSERT INTO player_activity (username, registration_at, last_seen, is_online)
      SELECT 'Player' || value, '2021-01-01T00:00:00Z'::timestamptz + value * INTERVAL '1 day', NOW(), FALSE
      FROM generate_series(1, 105) value;
      INSERT INTO player_name_history (username, player_uuid)
      VALUES ('OldName', '11111111-1111-4111-8111-111111111111');
      INSERT INTO player_playtime (username, player_uuid, total_seconds, tracking_since, updated_at) VALUES
        ('CurrentName', '11111111-1111-4111-8111-111111111111', 1000, NULL, NOW()),
        ('OldName', NULL, 200, NULL, NOW() - INTERVAL '1 day');
      INSERT INTO game_chat_messages (username, player_uuid, message_count, created_at) VALUES
        ('CurrentName', '11111111-1111-4111-8111-111111111111', 50, '2025-12-01T00:00:00Z'),
        ('CurrentName', '11111111-1111-4111-8111-111111111111', 5, '2026-01-02T00:00:00Z'),
        ('OldName', NULL, 2, '2026-01-03T00:00:00Z');
      INSERT INTO whitelist (username) VALUES ('CurrentName');
    `);

    const serverSource = fs.readFileSync(path.resolve(__dirname, '../server.js'), 'utf8');
    const functionSource = serverSource.match(
      /async function getPlayerStats\(\) \{[\s\S]*?\n\}(?=\r?\n\r?\nfunction obsidianChartBucketKey)/
    )?.[0];
    assert.ok(functionSource, 'getPlayerStats source must be available');
    const queries = [...functionSource.matchAll(/pool\.query\(`([\s\S]*?)`\)/g)].map(match => match[1]);
    assert.ok(queries.length >= 2, 'leaderboard SQL queries must be discoverable');

    const globalRows = (await db.query(queries[0])).rows;
    const whitelistRows = globalRows.filter(row => row.is_whitelisted);
    assert.equal(globalRows.length, 107, 'the server must return every identity instead of a preselected top 100');
    assert.equal(globalRows.filter(row => row.username === 'CurrentName').length, 1);

    for (const [scope, row] of [
      ['global', globalRows.find(candidate => candidate.username === 'CurrentName')],
      ['whitelisted', whitelistRows[0]]
    ]) {
      assert.equal(row.username, 'CurrentName', `${scope} leaderboard must use the current player name`);
      assert.equal(Number(row.total_seconds), 1200, `${scope} playtime must include UUID and legacy-name rows`);
      assert.equal(Number(row.total_messages), 123407, `${scope} messages must match the profile baseline calculation`);
      assert.equal(
        new Date(row.registration_at).toISOString(),
        '2020-02-03T04:05:06.000Z',
        `${scope} join date must resolve through the player's UUID identity`
      );
    }
    assert.equal(
      new Date(globalRows.find(row => row.username === 'Dot5').registration_at).toISOString(),
      '2015-01-01T00:00:00.000Z',
      'the global join-date source must include the oldest player even without a playtime row'
    );

    console.log('Player leaderboard metric tests passed.');
  } finally {
    await db.close();
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
