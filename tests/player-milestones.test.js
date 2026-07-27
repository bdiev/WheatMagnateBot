'use strict';

const assert = require('node:assert/strict');
const { buildPlayerMilestonePush, buildPlayerMilestones } = require('../site/player-milestones');

const rows = [
  { username: 'ChunkBase', registration_at: '2023-07-27T18:30:00.000Z' },
  { username: 'H4YWIRE', registration_at: '2021-07-28T00:00:00.000Z' },
  { username: 'LeapPlayer', registration_at: '2024-02-29T00:00:00.000Z' }
];

const today = buildPlayerMilestones(rows, {
  now: new Date('2026-07-27T00:00:00.000Z'),
  daysAhead: 0,
  limit: 100
});
assert.deepEqual(today.map(item => [item.username, item.years]), [['ChunkBase', 3]]);

const upcoming = buildPlayerMilestones(rows, {
  now: new Date('2026-07-27T00:00:00.000Z'),
  daysAhead: 1,
  limit: 100
});
assert.deepEqual(upcoming.map(item => item.username), ['ChunkBase', 'H4YWIRE']);

const leapDay = buildPlayerMilestones(rows, {
  now: new Date('2026-02-28T00:00:00.000Z'),
  daysAhead: 0,
  limit: 100
});
assert.equal(leapDay[0]?.username, 'LeapPlayer', 'February 29 anniversaries must fall on February 28 in non-leap years');

const notification = buildPlayerMilestonePush(today, '2026-07-27');
assert.equal(notification.event_type, 'player_milestone');
assert.equal(notification.id, 'player-milestones-2026-07-27');
assert.deepEqual(notification.metadata.milestones, [{ username: 'ChunkBase', years: 3, isRound: false }]);
assert.equal(buildPlayerMilestonePush([], '2026-07-27'), null);

console.log('Player milestone tests passed.');
