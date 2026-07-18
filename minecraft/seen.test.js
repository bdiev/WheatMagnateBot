'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { SeenResponseTracker, formatSeenTimestamp, parseObservedJoinDate } = require('./seen');

test('seen timestamps and observed dates are validated deterministically', () => {
  const now = Date.UTC(2026, 0, 2, 12, 0, 0);
  assert.equal(formatSeenTimestamp(new Date(now - 90061000), now), '1d 1h ago');
  assert.equal(formatSeenTimestamp(null, now), 'Never seen');
  assert.equal(parseObservedJoinDate('07/18/2026 15:40:12 extra').toISOString(), '2026-07-18T15:40:12.000Z');
  assert.equal(parseObservedJoinDate('02/30/2026 15:40:12'), null);
});

test('seen response tracking matches usernames without case and expires', () => {
  let now = 1000;
  const tracker = new SeenResponseTracker({ ttlMs: 500, now: () => now });
  tracker.arm('Requester', 'TargetPlayer');
  assert.equal(tracker.consume('targetplayer').targetUsername, 'TargetPlayer');
  assert.equal(tracker.consume('Requester'), null);
  tracker.arm('Requester', 'TargetPlayer');
  now += 501;
  assert.equal(tracker.consume('TARGETPLAYER'), null);
});
