'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { enqueueCommand, normalizeCommand } = require('./commandBus');

test('command bus normalizes and validates command envelopes', () => {
  assert.deepEqual(normalizeCommand({ source: ' site ', requestedBy: ' Admin ', commandType: 'RESUME', payload: { force: true } }), {
    source: 'site', requestedBy: 'Admin', commandType: 'resume', payload: { force: true }
  });
  assert.throws(() => normalizeCommand({ commandType: 'op_everyone' }), /Unsupported/);
  assert.throws(() => normalizeCommand({ commandType: 'resume', payload: [] }), /payload must be an object/);
});

test('command bus formation uses parameterized PostgreSQL values', async () => {
  const calls = [];
  const db = { query: async (sql, values) => {
    calls.push({ sql, values });
    return { rows: [{ id: 42, source: values[0], requested_by: values[1], command_type: values[2], payload: values[3], status: 'pending', created_at: new Date(0) }] };
  } };
  const result = await enqueueCommand(db, { source: 'site', requestedBy: 'Admin', commandType: 'pause', payload: { minutes: 5 } });
  assert.equal(result.command.id, '42');
  assert.equal(result.command.status, 'pending');
  assert.deepEqual(calls[0].values, ['site', 'Admin', 'pause', { minutes: 5 }]);
  assert.match(calls[0].sql, /VALUES \(\$1, \$2, \$3, \$4\)/);
});
