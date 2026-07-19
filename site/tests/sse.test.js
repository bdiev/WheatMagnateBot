'use strict';

const assert = require('node:assert');
const { EventEmitter } = require('node:events');
const { SseHub, handleSseRequest } = require('../sse');

class FakeRequest extends EventEmitter {}

class FakeResponse extends EventEmitter {
  constructor() {
    super();
    this.statusCode = null;
    this.headers = null;
    this.body = '';
    this.writableEnded = false;
  }
  writeHead(statusCode, headers) { this.statusCode = statusCode; this.headers = headers; }
  flushHeaders() {}
  write(chunk) { this.body += chunk; return true; }
  end(chunk = '') { this.body += chunk; this.writableEnded = true; }
}

async function open(hub, user) {
  const req = new FakeRequest();
  const res = new FakeResponse();
  const result = await handleSseRequest({ req, res, hub, getCurrentUser: async () => user });
  return { req, res, result };
}

async function run() {
  const authHub = new SseHub();
  const unauthorized = await open(authHub, null);
  assert.equal(unauthorized.result.accepted, false);
  assert.equal(unauthorized.res.statusCode, 401, 'SSE endpoint must require the existing session');
  assert.equal(authHub.connectionCount, 0);

  const cleanupHub = new SseHub({ maxConnectionsPerUser: 2 });
  const first = await open(cleanupHub, { id: '1', username: 'alice', role: 'user' });
  const second = await open(cleanupHub, { id: '1', username: 'alice', role: 'user' });
  const rejected = await open(cleanupHub, { id: '1', username: 'alice', role: 'user' });
  assert.equal(first.result.accepted, true);
  assert.equal(second.result.accepted, true);
  assert.equal(rejected.res.statusCode, 429, 'per-user connection limit must be enforced');
  first.req.emit('close');
  assert.equal(cleanupHub.countForUser('1'), 1, 'closed requests must be removed');
  assert.equal(first.req.listenerCount('close'), 0, 'request cleanup listener must be removed');
  assert.equal(first.res.listenerCount('close'), 0, 'response cleanup listener must be removed');
  second.res.emit('close');
  assert.equal(cleanupHub.connectionCount, 0);

  const routeHub = new SseHub({ maxConnectionsPerUser: 10 });
  const admin = await open(routeHub, { id: '10', username: 'admin', role: 'admin' });
  const alice = await open(routeHub, { id: '11', username: 'alice', role: 'user' });
  const bob = await open(routeHub, { id: '12', username: 'bob', role: 'user' });
  const beforeAdmin = admin.res.body.length;
  const beforeAlice = alice.res.body.length;
  routeHub.publish('notification_created', { id: '5' });
  assert(admin.res.body.length > beforeAdmin, 'admin events must reach admins');
  assert.equal(alice.res.body.length, beforeAlice, 'admin events must not reach ordinary users');
  const beforeTimelineAdmin = admin.res.body.length;
  const beforeTimelineUser = alice.res.body.length;
  routeHub.publish('operational_event_created', { id: '7' });
  assert(admin.res.body.length > beforeTimelineAdmin, 'timeline events must reach admins');
  assert.equal(alice.res.body.length, beforeTimelineUser, 'timeline events must not leak to ordinary users');
  const beforeWhisperAlice = alice.res.body.length;
  const beforeWhisperBob = bob.res.body.length;
  routeHub.publish('whisper_message', { id: '6' }, { usernames: ['alice'] });
  assert(alice.res.body.length > beforeWhisperAlice, 'private events must reach their owner');
  assert.equal(bob.res.body.length, beforeWhisperBob, 'private events must not leak to another user');

  const leakHub = new SseHub({ maxConnectionsPerUser: 1 });
  for (let index = 0; index < 100; index++) {
    const connection = await open(leakHub, { id: '20', username: 'reconnect', role: 'user' });
    connection.req.emit('close');
    assert.equal(leakHub.connectionCount, 0);
    assert.equal(connection.req.eventNames().length, 0);
    assert.equal(connection.res.eventNames().length, 0);
  }
  routeHub.stop();
  cleanupHub.stop();
  leakHub.stop();
  console.log('SSE tests passed.');
}

run().catch(err => { console.error(err); process.exitCode = 1; });
