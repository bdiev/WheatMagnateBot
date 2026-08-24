'use strict';

const assert = require('node:assert/strict');
const { createPlayerInfoObservationStore } = require('../features/playerInfoObservationStore');

function createFakePool({ uuid = '123e4567-e89b-12d3-a456-426614174000' } = {}) {
  const state = new Map();
  const client = {
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, ' ').trim();
      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(normalized)) return { rows: [], rowCount: 0 };
      if (normalized.includes('SELECT pa.username, pa.player_uuid')) {
        return { rows: [{ username: 'CurrentName', player_uuid: uuid }], rowCount: 1 };
      }
      if (normalized.includes('SELECT username FROM player_name_history')) {
        return { rows: [{ username: 'OldName' }, { username: 'CurrentName' }], rowCount: 2 };
      }
      if (normalized.includes('SELECT identity_key, imported, refresh_requested_at')) {
        const [metric, keys] = params;
        const rows = keys.map(key => state.get(`${metric}:${key}`)).filter(Boolean);
        return { rows, rowCount: rows.length };
      }
      if (normalized.startsWith('DELETE FROM player_info_observation_state')) {
        const [metric, keys, keepKey] = params;
        keys.filter(key => key !== keepKey).forEach(key => state.delete(`${metric}:${key}`));
        return { rows: [], rowCount: 0 };
      }
      if (normalized.startsWith('INSERT INTO player_info_observation_state')) {
        const [metric, identityKey, username, imported, refreshRequestedAt] = params;
        state.set(`${metric}:${identityKey}`, {
          identity_key: identityKey,
          username,
          imported,
          refresh_requested_at: refreshRequestedAt
        });
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`Unexpected query: ${normalized}`);
    },
    release() {}
  };
  return { state, pool: { connect: async () => client } };
}

async function testInitialImportOnlyRunsOnce() {
  const { pool } = createFakePool();
  const store = createPlayerInfoObservationStore({ pool });
  let writes = 0;
  const first = await store.withPermission('playtime', 'OldName', async () => ++writes);
  const repeated = await store.withPermission('playtime', 'CurrentName', async () => ++writes);
  assert.equal(first.allowed, true);
  assert.equal(first.reason, 'initial-import');
  assert.equal(repeated.allowed, false);
  assert.equal(repeated.reason, 'already-imported');
  assert.equal(writes, 1, 'aliases of one UUID must share the one-time import state');
}

async function testMessagesImportOnlyRunsOnce() {
  const { pool } = createFakePool();
  const store = createPlayerInfoObservationStore({ pool });
  let writes = 0;
  const first = await store.withPermission('messages', 'OldName', async () => ++writes);
  const repeated = await store.withPermission('messages', 'CurrentName', async () => ++writes);
  assert.equal(first.allowed, true);
  assert.equal(repeated.allowed, false);
  assert.equal(writes, 1);
}

async function testSiteRefreshOpensExactlyOneUpdate() {
  const { pool } = createFakePool();
  const store = createPlayerInfoObservationStore({ pool });
  let writes = 0;
  await store.withPermission('joinDate', 'CurrentName', async () => ++writes);
  await store.requestRefresh('joinDate', 'CurrentName');
  const refresh = await store.withPermission('joinDate', 'CurrentName', async () => ++writes);
  const repeated = await store.withPermission('joinDate', 'CurrentName', async () => ++writes);
  assert.equal(refresh.allowed, true);
  assert.equal(refresh.reason, 'site-refresh');
  assert.equal(repeated.allowed, false);
  assert.equal(writes, 2, 'one site click must authorize one additional write only');
}

async function testExpiredRefreshDoesNotAuthorizeAWrite() {
  const { pool } = createFakePool({ uuid: null });
  let clock = 0;
  const store = createPlayerInfoObservationStore({ pool, now: () => new Date(clock), refreshTtlMs: 1_000 });
  let writes = 0;
  await store.withPermission('playtime', 'CurrentName', async () => ++writes);
  await store.requestRefresh('playtime', 'CurrentName');
  clock = 1_001;
  const expired = await store.withPermission('playtime', 'CurrentName', async () => ++writes);
  assert.equal(expired.allowed, false);
  assert.equal(writes, 1);
}

Promise.resolve()
  .then(testInitialImportOnlyRunsOnce)
  .then(testMessagesImportOnlyRunsOnce)
  .then(testSiteRefreshOpensExactlyOneUpdate)
  .then(testExpiredRefreshDoesNotAuthorizeAWrite)
  .then(() => console.log('Player info observation store tests passed.'));
