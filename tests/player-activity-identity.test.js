'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createPlayerActivityRepository } = require('../database');

async function run() {
  const uuid = '11111111-1111-4111-8111-111111111111';
  const queries = [];
  const client = {
    async query(sql, params = []) {
      queries.push({ sql: String(sql), params });
      if (/SELECT id,username,player_uuid/.test(sql)) {
        return {
          rows: [
            { id: 10, username: 'OldPlayerName', player_uuid: uuid },
            { id: 22, username: 'Jeff_Bezos_MC', player_uuid: null }
          ]
        };
      }
      if (/SELECT username,player_uuid,total_seconds,tracking_since,updated_at/.test(sql)) {
        return {
          rows: [
            { username: 'OldPlayerName', player_uuid: uuid, total_seconds: '120', tracking_since: null },
            { username: 'Jeff_Bezos_MC', player_uuid: null, total_seconds: '30', tracking_since: null }
          ]
        };
      }
      return { rows: [], rowCount: 1 };
    },
    release() {
      queries.push({ sql: 'RELEASE', params: [] });
    }
  };
  const pool = {
    connect: async () => client,
    query: async (sql, params = []) => {
      queries.push({ sql: String(sql), params });
      return { rows: [], rowCount: 0 };
    }
  };
  const repository = createPlayerActivityRepository({ pool });

  await repository.updatePlayerActivity('Jeff_Bezos_MC', true, {
    recordEvent: false,
    uuid
  });

  const statements = queries.map(item => item.sql.trim());
  const mergeIndex = statements.findIndex(sql => /UPDATE player_activity target/.test(sql));
  const deleteIndex = statements.findIndex(sql => /DELETE FROM player_activity WHERE id=\$1/.test(sql));
  const activityUpdateIndex = statements.findIndex(sql => /WITH updated AS/.test(sql));
  assert.ok(mergeIndex > 0, 'UUID and username rows must be merged');
  assert.ok(deleteIndex > mergeIndex, 'the duplicate username row must be removed after its state is merged');
  assert.ok(activityUpdateIndex > deleteIndex, 'the current username may only be assigned after the duplicate is removed');
  assert.deepEqual(queries[deleteIndex].params, [22]);
  const playtimeDeleteIndex = statements.findIndex(sql => /DELETE FROM player_playtime/.test(sql));
  const playtimeInsertIndex = statements.findIndex(sql => /INSERT INTO player_playtime\(username,player_uuid/.test(sql));
  const chatReassignmentIndex = statements.findIndex(sql => /UPDATE game_chat_messages/.test(sql));
  assert.ok(playtimeDeleteIndex > activityUpdateIndex, 'UUID-owned playtime aliases must be merged after activity identity is current');
  assert.ok(playtimeInsertIndex > playtimeDeleteIndex, 'merged playtime must be written back under the current nickname');
  assert.deepEqual(queries[playtimeInsertIndex].params.slice(0, 3), ['Jeff_Bezos_MC', uuid, '150']);
  assert.ok(chatReassignmentIndex > playtimeInsertIndex, 'legacy chat messages must be attached to the UUID');
  assert.equal(statements[0], 'BEGIN');
  assert.equal(statements.at(-2), 'COMMIT');
  assert.equal(statements.at(-1), 'RELEASE');

  const root = path.resolve(__dirname, '..');
  const databaseMigration = fs.readFileSync(path.join(root, 'database', 'migrations', '020_player_uuid_identity.sql'), 'utf8');
  const siteMigration = fs.readFileSync(path.join(root, 'site', 'migrations', '020_player_uuid_identity.sql'), 'utf8');
  const siteSource = fs.readFileSync(path.join(root, 'site', 'server.js'), 'utf8');
  const botSource = fs.readFileSync(path.join(root, 'bot.js'), 'utf8');
  assert.equal(siteMigration, databaseMigration, 'bot and site must apply the same UUID identity migration');
  assert.match(databaseMigration, /ALTER TABLE player_playtime[\s\S]*player_uuid UUID/);
  assert.match(databaseMigration, /ALTER TABLE game_chat_messages[\s\S]*player_uuid UUID/);
  assert.match(databaseMigration, /player_playtime_uuid_unique_idx/);
  assert.match(siteSource, /searched_name\.player_uuid = pa\.player_uuid/, 'profile search must resolve previous names to the current UUID');
  assert.match(siteSource, /pool\.query\(`\s*WITH activity AS \(/, 'the UUID profile query must start a valid CTE');
  assert.match(siteSource, /game_chat_messages[\s\S]*player_uuid = \$1::uuid/, 'profile chat must be selected by UUID');
  assert.match(botSource, /INSERT INTO game_chat_messages \(username, player_uuid, message\)/, 'new chat messages must store the UUID');
  assert.match(botSource, /INSERT INTO player_playtime \(username, player_uuid, total_seconds, tracking_since, updated_at\)/, 'startup deduplication must preserve UUID ownership');

  console.log('Player activity identity tests passed.');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
