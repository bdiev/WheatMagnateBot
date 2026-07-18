'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { formatPlaytime, parsePlaytime } = require('./duration');

test('playtime calculation parses combined units', () => {
  assert.equal(parsePlaytime('2 days, 3 hours, 4 minutes, 5 seconds'), 183845);
  assert.equal(parsePlaytime('1h 30m'), 5400);
  assert.equal(parsePlaytime('1 hour garbage'), null);
  assert.equal(parsePlaytime(''), null);
});

test('playtime formatting clamps invalid and negative durations', () => {
  assert.equal(formatPlaytime(183845), '2d 3h 4m');
  assert.equal(formatPlaytime(3599), '59m');
  assert.equal(formatPlaytime(-100), '0m');
});
