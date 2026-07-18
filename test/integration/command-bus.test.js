'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Client } = require('pg');
const { DeferredCommandError, enqueueCommand, processPendingCommands } = require('../../database/commandBus');

test('PostgreSQL command bus persists done, deferred and failed outcomes', async t => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return t.skip('DATABASE_URL is required for PostgreSQL integration tests.');
  const schema = `command_bus_test_${process.pid}_${Date.now()}`;
  const quoted = `"${schema}"`;
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA ${quoted}`);
    await client.query(`SET search_path TO ${quoted}`);
    await client.query(`CREATE TABLE bot_commands (
      id BIGSERIAL PRIMARY KEY, source VARCHAR(32) NOT NULL, requested_by VARCHAR(255),
      command_type VARCHAR(64) NOT NULL, payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      status VARCHAR(20) NOT NULL DEFAULT 'pending', result JSONB, error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), started_at TIMESTAMPTZ, finished_at TIMESTAMPTZ
    )`);

    await enqueueCommand(client, { commandType: 'resume', requestedBy: 'Admin' });
    await enqueueCommand(client, { commandType: 'site_whisper', requestedBy: 'Admin', payload: { username: 'OfflineUser' } });
    await enqueueCommand(client, { commandType: 'pause', requestedBy: 'Admin' });

    const transitions = await processPendingCommands(client, async command => {
      if (command.command_type === 'resume') return { resumed: true };
      if (command.command_type === 'site_whisper') {
        throw new DeferredCommandError('Player is offline.', { offlineUntilJoin: true });
      }
      throw new Error('Mock adapter rejected the command.');
    });

    assert.deepEqual(transitions.map(item => item.status), ['done', 'pending', 'failed']);
    const result = await client.query('SELECT command_type, status, result, error, payload FROM bot_commands ORDER BY id');
    assert.deepEqual(result.rows.map(row => [row.command_type, row.status]), [
      ['resume', 'done'], ['site_whisper', 'pending'], ['pause', 'failed']
    ]);
    assert.equal(result.rows[0].result.resumed, true);
    assert.equal(result.rows[1].result.deferred, true);
    assert.equal(result.rows[1].payload.offlineUntilJoin, true);
    assert.match(result.rows[2].error, /Mock adapter rejected/);
  } finally {
    await client.query('SET search_path TO public').catch(() => {});
    await client.query(`DROP SCHEMA IF EXISTS ${quoted} CASCADE`).catch(() => {});
    await client.end();
  }
});
