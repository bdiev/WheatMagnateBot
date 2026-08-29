'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  PUSH_TEST_TYPES, WebPushService, buildTestPushPayload, deliverPushSubscriptions, isQuietHours,
  normalizePreferences, safePushPayload, shouldDeliverSubscription
} = require('../web-push');

async function run() {
  const unconfigured = new WebPushService({ pool: {}, publicKey: '', privateKey: '' });
  assert.equal(unconfigured.configured, false);
  assert.match(unconfigured.configurationError, /VAPID_PUBLIC_KEY.*VAPID_PRIVATE_KEY/,
    'missing VAPID keys must produce an actionable configuration reason');

  const base = {
    id: 1, endpoint: 'https://push.example/subscription', p256dh: 'a'.repeat(64), auth: 'b'.repeat(16),
    enabled: true, minimum_severity: 'warning', event_types: ['low_tps'], detailed_event_types: [], include_resolved: false,
    quiet_hours_enabled: false, quiet_start: '22:00', quiet_end: '07:00', timezone: 'Europe/Vilnius',
    game_time_enabled: false, game_time_minute: 360
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

  const detailedPayload = JSON.stringify(safePushPayload({ ...warning, metadata: { tps: 8.45 } }, { detailed: true }));
  assert.match(detailedPayload, /Current server TPS: 8\.4/, 'enabled detailed mode must include allowlisted event metrics');
  assert.doesNotMatch(detailedPayload, /Secret title|secret SQL|coordinates/, 'detailed mode must still exclude arbitrary sensitive text');
  const preferences = normalizePreferences({ eventTypes: ['low_tps'], detailedEventTypes: ['low_tps', 'command_failed', 'unknown'] });
  assert.deepEqual(preferences.detailedEventTypes, ['low_tps'], 'detailed types must be valid and selected for delivery');
  const gameTimePreferences = normalizePreferences({ gameTimeEnabled: true, gameTime: '18:30' });
  assert.equal(gameTimePreferences.gameTimeEnabled, true);
  assert.equal(gameTimePreferences.gameTimeMinute, 1110);

  const whisperSubscription = { ...base, minimum_severity: 'info', event_types: ['whisper_message'], detailed_event_types: ['whisper_message'] };
  const whisperAccountId = '11111111-1111-4111-8111-111111111111';
  const whisper = { id: 'whisper-42', event_type: 'whisper_message', severity: 'info', metadata: { sender: 'SecretPlayer', message: 'secret whisper text', accountId: whisperAccountId } };
  assert.equal(shouldDeliverSubscription(whisperSubscription, whisper), true, 'whisper event selection must be supported');
  assert.equal(shouldDeliverSubscription({ ...whisperSubscription, minimum_severity: 'critical' }, whisper), true, 'whispers must not be hidden by operational severity filters');
  const compactWhisper = safePushPayload(whisper);
  const whisperPayload = JSON.stringify(compactWhisper);
  assert.match(whisperPayload, /New private message/);
  const whisperUrl = new URL(compactWhisper.data.url, 'https://dashboard.example');
  assert.equal(whisperUrl.searchParams.get('push'), 'whispers');
  assert.equal(whisperUrl.searchParams.get('player'), 'SecretPlayer', 'whisper push must deep-link to its dialog');
  assert.equal(whisperUrl.searchParams.get('accountId'), whisperAccountId, 'whisper push must deep-link to the bot that received it');
  assert.doesNotMatch(compactWhisper.body, /SecretPlayer|secret whisper text/, 'compact whisper lock screen must omit sender and text');
  assert.equal(compactWhisper.icon, '/items/Wheat.png', 'compact whispers must not reveal the sender through an avatar');
  const detailedWhisper = safePushPayload(whisper, { detailed: true });
  const detailedWhisperPayload = JSON.stringify(detailedWhisper);
  assert.match(detailedWhisperPayload, /SecretPlayer: secret whisper text/, 'explicit whisper detailed mode must include sender and text');
  assert.equal(
    detailedWhisper.icon,
    '/api/minecraft-avatar?username=SecretPlayer&v=2',
    'detailed whisper pushes must request the sender Minecraft avatar'
  );

  const dailyReport = {
    id: 'daily-obsidian-2026-07-19', event_type: 'daily_obsidian_report', severity: 'info',
    metadata: {
      mined24h: 29419, changePercent: 5, averageRate: 1225.8, pickaxes: 8, food: 100,
      pickaxeDaysByBot: [
        { name: 'WheatMagnate', hasSnapshot: true, pickaxes: 5, days: 3.4 },
        { name: 'Obsidian Alt', hasSnapshot: true, pickaxes: 3, days: 1.2 }
      ]
    }
  };
  const dailySubscription = { ...base, minimum_severity: 'critical', event_types: ['daily_obsidian_report'] };
  assert.equal(shouldDeliverSubscription(dailySubscription, dailyReport), true, 'selected scheduled reports must not be suppressed by alert severity');
  const compactDailyPayload = safePushPayload(dailyReport);
  assert.equal(compactDailyPayload.title, 'Daily Obsidian Farm Report');
  assert.equal(new URL(compactDailyPayload.data.url, 'https://dashboard.example').searchParams.get('push'), 'obsidian');
  assert.doesNotMatch(compactDailyPayload.body, /29.?419|1.?225|8 pickaxes/, 'compact report must not expose report details');
  const detailedDailyPayload = safePushPayload(dailyReport, { detailed: true });
  assert.match(detailedDailyPayload.body, /29,419 obsidian \(\+5%\)/);
  assert.match(detailedDailyPayload.body, /1,225\.8\/h/);
  assert.match(detailedDailyPayload.body, /WheatMagnate: 3\.4d \(5 picks\)/);
  assert.match(detailedDailyPayload.body, /Obsidian Alt: 1\.2d \(3 picks\)/);

  assert.deepEqual(PUSH_TEST_TYPES.map(item => item.value), ['generic', 'critical', 'whisper', 'obsidian', 'milestone', 'game_time']);
  const whisperTest = buildTestPushPayload('whisper', '42');
  assert.match(whisperTest.title, /^Test · New private message$/);
  assert.match(whisperTest.body, /Notch: This is a test Minecraft whisper\./);
  assert.equal(whisperTest.icon, '/api/minecraft-avatar?username=Notch&v=2');
  assert.equal(whisperTest.data.url, '/?push=settings');
  const obsidianTest = buildTestPushPayload('obsidian', '42');
  assert.match(obsidianTest.body, /WheatMagnate: 4\.3d/);
  assert.match(obsidianTest.body, /Obsidian Alt: 2\.0d/);
  const gameTimeTest = buildTestPushPayload('game_time', '42');
  assert.equal(gameTimeTest.title, 'Test · Minecraft time reached');
  assert.match(gameTimeTest.body, /18:30 in Minecraft/);
  assert.throws(() => buildTestPushPayload('not-a-test-type'), /Invalid test push type/);

  const gameTimeNotification = {
    id: 'server-game-time-42-1110', event_type: 'server_game_time', severity: 'info',
    metadata: { gameTimeMinute: 1110, gameDay: 42 }
  };
  const gameTimeSubscription = { ...base, minimum_severity: 'critical', event_types: ['low_tps'], game_time_enabled: true };
  assert.equal(shouldDeliverSubscription(gameTimeSubscription, gameTimeNotification), true,
    'the dedicated game-time setting must bypass operational severity and event filters');
  assert.equal(shouldDeliverSubscription({ ...gameTimeSubscription, game_time_enabled: false }, gameTimeNotification), false);
  const gameTimePayload = safePushPayload(gameTimeNotification);
  assert.equal(gameTimePayload.title, 'Minecraft time reached');
  assert.match(gameTimePayload.body, /18:30 in Minecraft/);
  assert.equal(new URL(gameTimePayload.data.url, 'https://dashboard.example').searchParams.get('push'), 'settings');

  const serviceWorkerSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'sw.js'), 'utf8');
  assert.match(serviceWorkerSource, /payload\.body[\s\S]*?slice\(0, 2000\)/,
    'expanded push bodies must retain complete multi-account report details');
  assert.match(serviceWorkerSource, /pushsubscriptionchange[\s\S]*?push_subscription_changed/,
    'browser-side subscription rotation must tell an open PWA to repair its server registration');
  const pushAppSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  const pushStylesSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');
  assert.match(pushAppSource, /class="push-time-control"><input type="time"/,
    'quiet-hours inputs must have a width-constraining wrapper for iOS');
  assert.match(pushAppSource, /name="gameTimeEnabled"[\s\S]*?name="gameTime"/,
    'each push device must expose its Minecraft time alert and target time');
  assert.match(pushAppSource, /pushSubscriptionNeedsRepair[\s\S]*?subscription\.unsubscribe\(\)/,
    'stale local subscriptions must be recreated instead of being reused');
  assert.match(pushStylesSource, /\.push-time-control \{[^}]*overflow: hidden;/,
    'the iOS time-input wrapper must clip native intrinsic overflow');

  const milestone = {
    id: 'player-milestones-2026-07-27', event_type: 'player_milestone', severity: 'info',
    metadata: { milestones: [{ username: 'ChunkBase', years: 3 }, { username: 'H4YWIRE', years: 5 }] }
  };
  const milestoneSubscription = { ...base, minimum_severity: 'critical', event_types: ['player_milestone'] };
  assert.equal(shouldDeliverSubscription(milestoneSubscription, milestone), true, 'selected milestones must not be suppressed by alert severity');
  const compactMilestonePayload = safePushPayload(milestone);
  assert.equal(compactMilestonePayload.title, 'Player Milestone');
  assert.equal(new URL(compactMilestonePayload.data.url, 'https://dashboard.example').searchParams.get('push'), 'players');
  assert.doesNotMatch(compactMilestonePayload.body, /ChunkBase|H4YWIRE/, 'compact milestone push must omit player names');
  const detailedMilestonePayload = safePushPayload(milestone, { detailed: true });
  assert.match(detailedMilestonePayload.body, /ChunkBase: 3 years/);
  assert.match(detailedMilestonePayload.body, /H4YWIRE: 5 years/);

  const resourceRequest = {
    id: 'resource-request-17', event_type: 'resource_request_created', severity: 'info',
    metadata: { requestId: '17', minecraftUsername: 'Steve', resources: '4 shulker boxes of stone' }
  };
  const requestSubscription = { ...base, minimum_severity: 'critical', event_types: ['resource_request_created'] };
  assert.equal(shouldDeliverSubscription(requestSubscription, resourceRequest), true, 'new requests must not be suppressed by operational severity filters');
  const compactRequestPayload = safePushPayload(resourceRequest);
  assert.equal(compactRequestPayload.title, 'New resource request');
  assert.equal(new URL(compactRequestPayload.data.url, 'https://dashboard.example').searchParams.get('push'), 'requests');
  assert.doesNotMatch(compactRequestPayload.body, /Steve|shulker/, 'compact request push must omit order details');
  const detailedRequestPayload = safePushPayload(resourceRequest, { detailed: true });
  assert.match(detailedRequestPayload.body, /Steve submitted request #17/);
  assert.match(detailedRequestPayload.body, /4 shulker boxes of stone/);

  const deliveredPayloads = [];
  const detailedResult = await deliverPushSubscriptions({
    subscriptions: [{ ...base, id: 2, detailed_event_types: ['low_tps'] }],
    notification: { ...warning, metadata: { tps: 7.25 } },
    sendNotification: async (_subscription, sentPayload) => deliveredPayloads.push(JSON.parse(sentPayload)),
    removeInvalid: async () => {}
  });
  assert.equal(detailedResult.sent, 1);
  assert.match(deliveredPayloads[0].body, /7\.3/, 'delivery must apply detailed preferences per subscription');

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
      if (/WITH claimed AS/.test(sql)) return { rows: [gameTimeSubscription] };
      if (/SELECT ps\.\*/.test(sql)) return { rows: params?.length ? [whisperSubscription] : [milestoneSubscription] };
      return { rows: [], rowCount: 1 };
    } },
    publicKey: 'public', privateKey: 'private', subject: 'mailto:test@example.com',
    sender: { setVapidDetails() {}, sendNotification: async (_subscription, sentPayload) => sentPayloads.push(sentPayload) }
  });
  const personal = await service.deliverWhisper({
    id: 42, recipientUsername: 'Alice', sender: 'SecretPlayer', message: 'secret whisper text', accountId: whisperAccountId,
    now: new Date('2026-07-19T08:00:00Z')
  });
  assert.equal(personal.sent, 1);
  assert.deepEqual(queries[0].params, ['Alice']);
  assert.match(queries[0].sql, /LOWER\(u\.username\)=LOWER\(\$1\)/, 'whisper push must target the owning site username');
  assert.doesNotMatch(queries[0].sql, /u\.role='admin'/, 'whisper push must work for non-admin site users');
  assert.equal(sentPayloads.length, 1);
  assert.match(sentPayloads[0], /SecretPlayer: secret whisper text/);
  assert.match(sentPayloads[0], new RegExp(whisperAccountId), 'delivered whisper push must retain its bot account');

  const milestoneDelivery = await service.deliverPlayerMilestones(milestone);
  assert.equal(milestoneDelivery.sent, 1);
  const milestoneQuery = queries.find(item => /SELECT ps\.\*/.test(item.sql) && !item.params?.length);
  assert.ok(milestoneQuery, 'milestone delivery must query approved push subscribers');
  assert.match(milestoneQuery.sql, /u\.status='approved'/);
  assert.doesNotMatch(milestoneQuery.sql, /u\.role='admin'/, 'milestone push must work for non-admin site users');

  const gameTimeDelivery = await service.deliverGameTime({ gameTimeMinute: 1110, gameDay: 42 });
  assert.equal(gameTimeDelivery.sent, 1);
  assert.match(sentPayloads.at(-1), /18:30 in Minecraft/);
  const gameTimeQuery = queries.find(item => /WITH claimed AS/.test(item.sql));
  assert.deepEqual(gameTimeQuery.params, [1110, String(42 * 1440 + 1110)]);

  console.log('Web push tests passed.');
}

run().catch(err => { console.error(err); process.exitCode = 1; });
