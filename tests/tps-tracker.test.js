'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  normalizeTps,
  parseTpsText,
  looksLikePlayerLine,
  createTpsTracker
} = require('../minecraft/tps-tracker');

// Parsing of server-controlled text
assert.equal(parseTpsText('Ping: 42ms | 19.8 TPS | oldfag.org'), 19.8);
assert.equal(parseTpsText('§a19.95§7 tps'), 19.95);
assert.equal(parseTpsText('TPS from last 1m, 5m, 15m: 18.2, 19.1, 19.9'), 18.2);
assert.equal(parseTpsText('TPS from last 1m, 5m, 15m: *20.02, *20.0, 20.0'), 20);
assert.equal(parseTpsText('TPS: 17,5 | Players: 40'), 17.5);
assert.equal(parseTpsText('20.0 TPS 15 players'), 20);
assert.equal(parseTpsText('Ping 20 TPS: 19.9'), 19.9);
assert.equal(parseTpsText('Welcome to oldfag.org'), null);
assert.equal(parseTpsText('9999 tps'), null);
assert.equal(parseTpsText(''), null);
assert.equal(normalizeTps('abc'), null);
assert.equal(normalizeTps(-1), null);
assert.equal(normalizeTps(21), 20);

// Player-written lines must never be treated as a /tps reply
assert.equal(looksLikePlayerLine('<Griefer> lol 3 tps'), true);
assert.equal(looksLikePlayerLine('[VIP] <Griefer> 3 tps'), true);
assert.equal(looksLikePlayerLine('Griefer: TPS from last 1m, 5m, 15m: 1.0'), true);
assert.equal(looksLikePlayerLine('Griefer whispers: 3 tps'), true);
assert.equal(looksLikePlayerLine('TPS from last 1m, 5m, 15m: 20.0, 20.0, 20.0'), false);
assert.equal(looksLikePlayerLine('TPS: 19.8'), false);

// Reported values expire, measured values come from world age
let clock = 1_000_000;
const tracker = createTpsTracker({ now: () => clock });
assert.equal(tracker.getTps(), null);
assert.equal(tracker.setReported(19.5, 'tab'), 19.5);
assert.equal(tracker.getTps(), 19.5);
clock += 2 * 60_000 + 1;
assert.equal(tracker.hasFreshReported(), false);
assert.equal(tracker.getTps(), null);
assert.equal(tracker.setReported('nope', 'chat'), null);

// Healthy server: 20 ticks per second
tracker.reset();
for (let i = 0; i <= 10; i++) {
  tracker.observeWorldAge(1000 + i * 20);
  if (i < 10) clock += 1000;
}
assert.equal(tracker.getTps(), 20);

// Lagging server: 20 ticks every 2 seconds
tracker.reset();
for (let i = 0; i <= 10; i++) {
  tracker.observeWorldAge(5000 + i * 20);
  if (i < 10) clock += 2000;
}
assert.equal(tracker.getTps(), 10);

// Server freezes: no update_time packets, the rate must drop instead of staying stale
clock += 20_000;
assert.ok(tracker.getTps() <= 1);

// Too little data yields no measurement; reset clears everything
tracker.reset();
tracker.observeWorldAge(100);
clock += 1000;
tracker.observeWorldAge(120);
assert.equal(tracker.getMeasuredTps(), null);

// bot.js must not fall back to client-side physicsTick timing or parse arbitrary chat
const botSource = fs.readFileSync(path.join(__dirname, '..', 'bot.js'), 'utf8');
assert.doesNotMatch(botSource, /tpsHistory|realTps/);
assert.match(botSource, /tpsTracker\.observeWorldAge\(/);
assert.match(botSource, /bot\.on\('end', \(reason\) => \{\s*resetTpsTracking\(\);/);

console.log('tps-tracker tests passed');
