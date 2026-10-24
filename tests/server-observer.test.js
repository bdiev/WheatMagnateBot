'use strict';

const assert = require('node:assert/strict');
const { chooseObserver } = require('../features/serverObserver');

const primaryBot = { name:'WheatMagnate' };
const secondBot = { name:'Second' };
const thirdBot = { name:'Third' };
const now = 100_000;
const primary = (spawnedAt = 0) => ({ accountId:'p', bot:primaryBot, isPrimary:true, spawnedAt });
const second = (spawnedAt = 0) => ({ accountId:'s', bot:secondBot, isPrimary:false, spawnedAt });
const third = (spawnedAt = 0) => ({ accountId:'t', bot:thirdBot, isPrimary:false, spawnedAt });

assert.equal(chooseObserver({ candidates:[], now }), null, 'no bot in game, no observer');
assert.equal(chooseObserver({ candidates:[primary(), second()], now }).bot, primaryBot, 'the primary watches while it is in game');
assert.equal(chooseObserver({ candidates:[second(), third()], now }).bot, secondBot, 'otherwise the first bot in account order');
assert.equal(chooseObserver({ candidates:[second(), third()], currentBot:thirdBot, now }).bot, thirdBot,
  'the watch does not move between secondary bots while the current one stays');
assert.equal(chooseObserver({ candidates:[primary(now - 1_000), second()], currentBot:secondBot, now }).bot, secondBot,
  'a primary that has just spawned waits until its player list is complete');
assert.equal(chooseObserver({ candidates:[primary(now - 6_000), second()], currentBot:secondBot, now }).bot, primaryBot,
  'then it takes the watch back');
assert.equal(chooseObserver({ candidates:[primary(now - 1_000), second()], now }).bot, secondBot,
  'with no observer, a settled bot is preferred over one that has just spawned');
assert.equal(chooseObserver({ candidates:[primary(now - 1_000)], now }).bot, primaryBot,
  'a bot that has just spawned watches when it is the only one');

// The wiring in bot.js
const fs = require('node:fs');
const path = require('node:path');
const botSource = fs.readFileSync(path.resolve(__dirname, '..', 'bot.js'), 'utf8').replace(/\r\n/g, '\n');
const refresh = botSource.match(/function refreshObserver[\s\S]*?\n\}\n/)?.[0] || '';
assert.match(refresh, /if \(!nextBot\) \{[\s\S]*?closeObservedPlayerSessions\(\);[\s\S]*?return;\s*\}/,
  'the players are closed only when no bot is left in game');
assert.equal((refresh.match(/closeObservedPlayerSessions\(\)/g) || []).length, 1,
  'a handover to another bot keeps the players\' sessions open');
assert.match(refresh, /if \(previousBot\) \{[\s\S]*?playerActivityJoinEventsReady = true;/,
  'the new observer\'s complete player list is trusted at once');
assert.match(refresh, /detachObserverListeners\?\.\(\);[\s\S]*?detachObserverListeners = attachObserverListeners\(nextBot\);/,
  'only one bot listens to the server at a time');
assert.match(botSource, /function observerCandidates[\s\S]*?account\.role === PEARL_LOADER_ROLE\) continue;/,
  'the Pearl Loader never watches the server');
assert.match(botSource, /bot\.on\('end', \(reason\) => \{[\s\S]*?refreshObserver\(\{ gone: createdBot \}\);/,
  'WheatMagnate leaving hands the watch over at once');
assert.match(botSource, /runtime\.on\('end', reason => \{\s*refreshObserver\(\);/,
  'another bot leaving hands the watch over at once');
assert.doesNotMatch(botSource.match(/\nfunction createBot\(\) \{[\s\S]*?\n\}\n/)?.[0] || '', /bot\.on\('(?:chat|playerJoined|playerLeft|message|messagestr)'/,
  'WheatMagnate listens to the server only while it is the observer');

console.log('Server observer tests passed.');
