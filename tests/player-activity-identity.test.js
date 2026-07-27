'use strict';

const assert = require('node:assert/strict');
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
  assert.equal(statements[0], 'BEGIN');
  assert.equal(statements.at(-2), 'COMMIT');
  assert.equal(statements.at(-1), 'RELEASE');

  console.log('Player activity identity tests passed.');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
