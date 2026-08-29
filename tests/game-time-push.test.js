'use strict';

const assert = require('node:assert/strict');
const {
  GameTimePushMonitor,
  crossedGameTimeTargets,
  formatGameTimeMinute,
  gameTimeMinuteToTick,
  gameTimeToMinute,
  normalizeGameTime
} = require('../features/gameTimePush');

async function run() {
  assert.equal(normalizeGameTime('18:30'), '18:30');
  assert.equal(normalizeGameTime('24:00', '06:00'), '06:00');
  assert.equal(gameTimeToMinute('18:30'), 1110);
  assert.equal(formatGameTimeMinute(1110), '18:30');
  assert.equal(gameTimeMinuteToTick(360), 0, '06:00 is Minecraft tick 0');
  assert.equal(gameTimeMinuteToTick(720), 6000, '12:00 is Minecraft tick 6000');
  assert.equal(gameTimeMinuteToTick(1080), 12000, '18:00 is Minecraft tick 12000');
  assert.equal(gameTimeMinuteToTick(0), 18000, '00:00 is Minecraft tick 18000');

  assert.deepEqual(
    crossedGameTimeTargets(11_990, 12_010, [1080]),
    [{ gameTimeMinute: 1080, targetTick: 12000, gameDay: 0, occurrence: 12000 }],
    'a normal update must detect a configured time'
  );
  assert.deepEqual(
    crossedGameTimeTargets(23_990, 24_010, [360]),
    [{ gameTimeMinute: 360, targetTick: 0, gameDay: 1, occurrence: 24000 }],
    'crossing the Minecraft day boundary must trigger 06:00 on the new game day'
  );
  assert.deepEqual(crossedGameTimeTargets(12_010, 11_990, [1080]), [], 'backwards /time changes must not notify');
  assert.deepEqual(crossedGameTimeTargets(1_000, 10_000, [720]), [], 'large /time jumps must not emit a burst of alerts');

  const triggers = [];
  const monitor = new GameTimePushMonitor({
    getTargets: async () => [1080],
    onTrigger: async event => triggers.push(event),
    onError: error => { throw error; }
  });
  await monitor.observe(11_990);
  await monitor.observe(12_010);
  assert.equal(triggers.length, 1, 'the first observation is a baseline and the crossing triggers once');
  await monitor.observe(12_020);
  assert.equal(triggers.length, 1, 'later observations in the same game day must not repeat the alert');

  console.log('Game time push tests passed.');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
