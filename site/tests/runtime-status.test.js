'use strict';

const assert = require('node:assert/strict');
const { cleanAccountInput, freshStoredRuntimePayload } = require('../server');

const now = Date.parse('2026-07-21T12:00:00.000Z');
const connected = { connected:true,status:'connected',health:20,food:18,ping:42,nearbyPlayers:[{username:'Player'}] };

assert.equal(
  freshStoredRuntimePayload(connected, new Date(now-10_000), now).connected,
  true,
  'a recent runtime heartbeat remains online'
);

const stale = freshStoredRuntimePayload(connected, new Date(now-31_000), now);
assert.equal(stale.connected,false,'an expired runtime heartbeat is offline');
assert.equal(stale.status,'stopped');
assert.equal(stale.health,null);
assert.deepEqual(stale.nearbyPlayers,[]);

const alreadyOffline = {connected:false,status:'stopped',lastOfflineReason:'Stopped by user'};
assert.equal(freshStoredRuntimePayload(alreadyOffline, new Date(0), now),alreadyOffline,'offline state is preserved');

const accountWithoutPort = cleanAccountInput({displayName:'Second',username:'SecondBot',host:'example.org',port:null,authType:'microsoft'});
assert.equal(accountWithoutPort.port,25565,'an empty optional port uses the Minecraft default');

console.log('Managed runtime status tests passed.');
