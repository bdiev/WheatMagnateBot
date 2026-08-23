'use strict';

const assert = require('node:assert/strict');
const {
  NEW_PLAYER_WINDOW_DAYS,
  NEW_PLAYER_WINDOW_MS,
  isNewPlayerRegistration
} = require('../site/player-new-status');

const now = Date.parse('2026-08-23T12:00:00.000Z');
assert.equal(NEW_PLAYER_WINDOW_DAYS, 14);
assert.equal(NEW_PLAYER_WINDOW_MS, 14 * 24 * 60 * 60 * 1000);
assert.equal(isNewPlayerRegistration(new Date(now - NEW_PLAYER_WINDOW_MS + 1), now), true);
assert.equal(isNewPlayerRegistration(new Date(now - NEW_PLAYER_WINDOW_MS), now), false, 'the tag must disappear at exactly two weeks');
assert.equal(isNewPlayerRegistration(new Date(now + 1), now), false, 'future registration dates must not receive the tag');
assert.equal(isNewPlayerRegistration(null, now), false);

console.log('New player status tests passed.');
