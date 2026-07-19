'use strict';

const assert = require('node:assert/strict');
const {
  WebPushService, deliverPushSubscriptions, isQuietHours, safePushPayload, shouldDeliverSubscription
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

  const whisperSubscription = { ...base, minimum_severity: 'info', event_types: ['whisper_message'] };
  const whisper = { id: 'whisper-42', event_type: 'whisper_message', severity: 'info', sender: 'SecretPlayer', message: 'secret whisper text' };
  assert.equal(shouldDeliverSubscription(whisperSubscription, whisper), true, 'whisper event selection must be supported');
  assert.equal(shouldDeliverSubscription({ ...whisperSubscription, minimum_severity: 'critical' }, whisper), true, 'whispers must not be hidden by operational severity filters');
  const whisperPayload = JSON.stringify(safePushPayload(whisper));
  assert.match(whisperPayload, /New private message/);
  assert.match(whisperPayload, /\?push=whispers/);
  assert.doesNotMatch(whisperPayload, /SecretPlayer|secret whisper text/, 'whisper lock screen must omit sender and text');

  const removed = [];
  const invalidResult = await deliverPushSubscriptions({
    subscriptions: [base], notification: warning,
    sendNotification: async () => { throw Object.assign(new Error('gone'), { statusCode: 410 }); },
    removeInvalid: async id => removed.push(id)
  });
  assert.equal(invalidResult.removed, 1);
  assert.deepEqual(removed, [1], 'HTTP 410 subscriptions must be deleted');

  const queries = [];
  const sentPayloads = [];
  const service = new WebPushService({
    pool: { query: async (sql, params) => {
      queries.push({ sql, params });
      if (/SELECT ps\.\*/.test(sql)) return { rows: [whisperSubscription] };
      return { rows: [], rowCount: 1 };
    } },
    publicKey: 'public', privateKey: 'private', subject: 'mailto:test@example.com',
    sender: { setVapidDetails() {}, sendNotification: async (_subscription, sentPayload) => sentPayloads.push(sentPayload) }
  });
  const personal = await service.deliverWhisper({ id: 42, recipientUsername: 'Alice', now: new Date('2026-07-19T08:00:00Z') });
  assert.equal(personal.sent, 1);
  assert.deepEqual(queries[0].params, ['Alice']);
  assert.match(queries[0].sql, /LOWER\(u\.username\)=LOWER\(\$1\)/, 'whisper push must target the owning site username');
  assert.doesNotMatch(queries[0].sql, /u\.role='admin'/, 'whisper push must work for non-admin site users');
  assert.equal(sentPayloads.length, 1);

  console.log('Web push tests passed.');
}

run().catch(err => { console.error(err); process.exitCode = 1; });
