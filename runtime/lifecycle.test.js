'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { closeServer, startHealthServer } = require('./lifecycle');

test('health server exposes liveness state and closes cleanly', async () => {
  const server = startHealthServer({
    port: 0,
    getStatus: () => ({ mode: 'test', externalConnections: false })
  });
  await new Promise(resolve => server.once('listening', resolve));
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    mode: 'test',
    externalConnections: false
  });
  await closeServer(server);
  assert.equal(server.listening, false);
});
