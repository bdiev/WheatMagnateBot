'use strict';

const assert = require('node:assert/strict');
const {
  deliverPushSubscriptions, isQuietHours, safePushPayload, shouldDeliverSubscription
} = require('../web-push');

async function run() {
  const base = {
    id: 1, endpoint: 'https://push.example/subscription', p256dh: 'a'.repeat(64), auth: 'b'.repeat(16),
    enabled: true, minimum_severity: 'warning', event_types: ['low_tps'], include_resolved: false,
    quiet_hours_enabled: false, quiet_start: '22:00', quiet_end: '07:00', timezone: 'Europe/Vilnius'
  };
  const warning = { id: 10, event_type: 'low_tps', severity: 'warning', title: 'Secret title', message: 'secret SQL and coordinates' };

  assert.equal(shouldDeliverSubscription(base, warning), true, 'matching severity and event must pass');
  assert.equal(shouldDeliverSubscription({ ...base, minimum_severity: 'critical' }, warning), false, 'severity filter must apply');
  assert.equal(shouldDeliverSubscription({ ...base, event_types: ['farm_stalled'] }, warning), false, 'event filter must apply');
  assert.equal(shouldDeliverSubscription(base, warning, { resolved: true }), false, 'resolved delivery must be separately enabled');
  assert.equal(shouldDeliverSubscription({ ...base, include_resolved: true, minimum_severity: 'critical' }, warning, { resolved: true }), true, 'resolved setting is independent of active severity');

  const quiet = { ...base, quiet_hours_enabled: true };
  assert.equal(isQuietHours(quiet, new Date('2026-07-19T20:30:00Z')), true, 'overnight quiet hours must include local 23:30');
  assert.equal(isQuietHours(quiet, new Date('2026-07-19T08:00:00Z')), false, 'quiet hours must end at the configured local time');

  const payload = JSON.stringify(safePushPayload({ ...warning, severity: 'critical' }));
  assert.doesNotMatch(payload, /Secret title|secret SQL|coordinates/, 'lock-screen payload must omit source details');
  assert.match(payload, /Critical bot alert/);

  const removed = [];
  const invalidResult = await deliverPushSubscriptions({
    subscriptions: [base], notification: warning,
    sendNotification: async () => { throw Object.assign(new Error('gone'), { statusCode: 410 }); },
    removeInvalid: async id => removed.push(id)
  });
  assert.equal(invalidResult.removed, 1);
  assert.deepEqual(removed, [1], 'HTTP 410 subscriptions must be deleted');

  console.log('Web push tests passed.');
}

run().catch(err => { console.error(err); process.exitCode = 1; });
