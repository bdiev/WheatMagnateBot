'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  DEFAULT_INITIAL_DELAY_MAX_MS,
  DEFAULT_INITIAL_DELAY_MIN_MS,
  DEFAULT_MAX_INTERVAL_MS,
  DEFAULT_MIN_INTERVAL_MS,
  buildMissingCommands,
  createPlayerInfoBackfill,
  listReadyCommandSenders,
  loadMissingPlayerInfo,
  pickRandomCommandSender
} = require('../features/playerInfoBackfill');

function testOnlyMissingMetricsBecomeCommands() {
  assert.deepEqual(buildMissingCommands([
    { username: 'HasJD', missing_playtime: true, missing_messages: true, missing_join_date: false, missing_last_seen: true },
    { username: 'HasSeen', missing_playtime: true, missing_messages: false, missing_join_date: true, missing_last_seen: false },
    { username: 'HasPT', missing_playtime: false, missing_messages: false, missing_join_date: true, missing_last_seen: true },
    { username: 'Complete', missing_playtime: false, missing_messages: false, missing_join_date: false, missing_last_seen: false }
  ]), [
    { metric: 'playtime', username: 'HasJD', command: '!pt HasJD' },
    { metric: 'lastSeen', username: 'HasJD', command: '!seen HasJD' },
    { metric: 'messages', username: 'HasJD', command: '!msgs HasJD' },
    { metric: 'playtime', username: 'HasSeen', command: '!pt HasSeen' },
    { metric: 'joinDate', username: 'HasSeen', command: '!jd HasSeen' },
    { metric: 'joinDate', username: 'HasPT', command: '!jd HasPT' },
    { metric: 'lastSeen', username: 'HasPT', command: '!seen HasPT' }
  ]);
}

function testAutomaticCommandsAreMirroredToPublicChat() {
  const botSource = fs.readFileSync(path.join(__dirname, '..', 'bot.js'), 'utf8');
  assert.match(
    botSource,
    /selectSender:\s*\(\)\s*=>\s*pickRandomCommandSender[\s\S]*?sendCommand:[\s\S]*?sendPlayerInfoBackfillCommand/,
    'automatic player-info commands must select a connected account at random'
  );
  assert.match(
    botSource,
    /function sendPlayerInfoBackfillCommand[\s\S]*?sendGameChatMessageToDiscord\(senderUsername, command,[\s\S]*?source:\s*'player-info-backfill'/,
    'automatic player-info commands must appear in the shared chat without relying on their suppressed self echo'
  );
}

function testScheduleMigrationIsSharedByBotAndSite() {
  const root = path.join(__dirname, '..');
  const botMigration = fs.readFileSync(
    path.join(root, 'database', 'migrations', '034_player_info_backfill_schedule.sql'),
    'utf8'
  );
  const siteMigration = fs.readFileSync(
    path.join(root, 'site', 'migrations', '034_player_info_backfill_schedule.sql'),
    'utf8'
  );
  assert.equal(botMigration, siteMigration);
  assert.match(botMigration, /player_info_backfill_schedule[\s\S]*next_run_at TIMESTAMPTZ/);

  const botMessagesMigration = fs.readFileSync(
    path.join(root, 'database', 'migrations', '036_player_message_observation.sql'),
    'utf8'
  );
  const siteMessagesMigration = fs.readFileSync(
    path.join(root, 'site', 'migrations', '036_player_message_observation.sql'),
    'utf8'
  );
  assert.equal(botMessagesMigration, siteMessagesMigration);
  assert.match(botMessagesMigration, /observed_message_count BIGINT[\s\S]*'messages'/);
  assert.doesNotMatch(botMessagesMigration, /^\+/m, 'the SQL migration must not contain patch markers');

  const botZeroCleanup = fs.readFileSync(
    path.join(root, 'database', 'migrations', '037_reject_zero_player_messages.sql'),
    'utf8'
  );
  const siteZeroCleanup = fs.readFileSync(
    path.join(root, 'site', 'migrations', '037_reject_zero_player_messages.sql'),
    'utf8'
  );
  assert.equal(botZeroCleanup, siteZeroCleanup);
  assert.match(botZeroCleanup, /observed_message_count = NULL[\s\S]*observation\.metric = 'messages'/);
}

function testRandomSenderUsesOnlyConnectedAccounts() {
  const firstBot = { entity: {}, chat() {} };
  const secondBot = { entity: {}, chat() {} };
  const contexts = [
    { accountId: 'offline', bot: { chat() {} } },
    { accountId: 'first', bot: firstBot },
    { accountId: 'duplicate', bot: firstBot },
    { accountId: 'second', bot: secondBot }
  ];
  assert.deepEqual(listReadyCommandSenders(contexts).map(context => context.accountId), ['first', 'second']);
  assert.equal(pickRandomCommandSender(contexts, () => 0).accountId, 'first');
  assert.equal(pickRandomCommandSender(contexts, () => 0.999).accountId, 'second');
}

async function testScheduleUsesIrregularRanges() {
  const scheduled = [];
  const backfill = createPlayerInfoBackfill({
    pool: { async query() { return { rows: [] }; } },
    isReady: () => true,
    random: () => 0.5,
    setTimer: (callback, delay) => {
      const timer = { callback, delay, unref() {} };
      scheduled.push(timer);
      return timer;
    },
    clearTimer: () => {},
    onLog: () => {}
  });

  await backfill.start();
  assert.ok(scheduled[0].delay >= DEFAULT_INITIAL_DELAY_MIN_MS);
  assert.ok(scheduled[0].delay <= DEFAULT_INITIAL_DELAY_MAX_MS);
  await scheduled[0].callback();
  assert.ok(scheduled[1].delay >= DEFAULT_MIN_INTERVAL_MS);
  assert.ok(scheduled[1].delay <= DEFAULT_MAX_INTERVAL_MS);
  backfill.stop();
}

async function testRedeployRestoresTheSameRandomizedSlot() {
  let persistedNextRunAt = null;
  let currentTime = 1_000_000;
  const firstTimers = [];
  const createPersistentBackfill = (random, timers) => createPlayerInfoBackfill({
    pool: { async query() { return { rows: [] }; } },
    isReady: () => true,
    now: () => currentTime,
    random,
    loadNextRunAt: async () => persistedNextRunAt,
    saveNextRunAt: async timestamp => { persistedNextRunAt = timestamp; },
    setTimer: (callback, delay) => {
      const timer = { callback, delay, unref() {} };
      timers.push(timer);
      return timer;
    },
    clearTimer: () => {},
    onLog: () => {}
  });

  const beforeDeploy = createPersistentBackfill(() => 0, firstTimers);
  await beforeDeploy.start();
  const originallySelectedAt = persistedNextRunAt;
  assert.equal(originallySelectedAt, currentTime + DEFAULT_INITIAL_DELAY_MIN_MS);
  beforeDeploy.stop();

  currentTime += 60_000;
  const afterDeployTimers = [];
  const afterDeploy = createPersistentBackfill(() => 0.999, afterDeployTimers);
  await afterDeploy.start();
  assert.equal(persistedNextRunAt, originallySelectedAt, 'redeploy must not draw a new startup delay');
  assert.equal(afterDeployTimers[0].delay, originallySelectedAt - currentTime);
  afterDeploy.stop();
}

async function testNextSlotIsPersistedBeforeCommandsRun() {
  let currentTime = 5_000;
  let persistedNextRunAt = null;
  const timers = [];
  const backfill = createPlayerInfoBackfill({
    pool: {
      async query() {
        assert.equal(persistedNextRunAt, currentTime + 1_000,
          'the next slot must be durable before querying and sending commands');
        return { rows: [] };
      }
    },
    isReady: () => true,
    intervalMs: 1_000,
    initialDelayMs: 0,
    now: () => currentTime,
    random: () => 0,
    loadNextRunAt: async () => null,
    saveNextRunAt: async timestamp => { persistedNextRunAt = timestamp; },
    setTimer: (callback, delay) => {
      const timer = { callback, delay, unref() {} };
      timers.push(timer);
      return timer;
    },
    clearTimer: () => {},
    onLog: () => {}
  });

  await backfill.start();
  assert.equal(timers[0].delay, 0);
  await timers[0].callback();
  backfill.stop();
}

async function testDatabaseQueryUsesAllPlayerSourcesAndUuidIdentity() {
  let query = '';
  const rows = [{ username: 'Player', missing_playtime: true, missing_messages: true, missing_join_date: false, missing_last_seen: false }];
  const result = await loadMissingPlayerInfo({
    async query(sql) {
      query = sql;
      return { rows };
    }
  });
  assert.equal(result, rows);
  assert.match(query, /FROM player_activity activity/);
  assert.match(query, /FROM whitelist whitelist_player/);
  assert.match(query, /FROM player_playtime playtime/);
  assert.match(query, /candidate\.player_uuid IS NOT NULL AND playtime\.player_uuid = candidate\.player_uuid/);
  assert.match(query, /candidate\.registration_at IS NULL\s+OR candidate\.registration_at = candidate\.last_seen/,
    'registration dates copied from last seen must be rechecked');
  assert.match(query, /WHERE lookup_available\s+AND \(missing_playtime OR missing_messages OR missing_join_date OR missing_last_seen\)/);
  assert.match(query, /FROM player_info_lookup_exclusions exclusion/,
    'players rejected by the lookup source must not be scheduled again');
  assert.match(
    query,
    /ORDER BY \(\s*missing_playtime::int \+ missing_join_date::int \+ missing_last_seen::int\s*\) DESC,\s*RANDOM\(\)\s*LIMIT 1/,
    'players missing PT, JD and Seen must be selected before message-only gaps'
  );
}

async function testRunPreparesAndThrottlesCommands() {
  const sent = [];
  const prepared = [];
  const delays = [];
  const selectedSender = { accountId: 'random-bot' };
  const pool = {
    async query() {
      return { rows: [{
        username: 'PartialPlayer',
        missing_playtime: true,
        missing_join_date: false,
        missing_last_seen: true
      }] };
    }
  };
  const backfill = createPlayerInfoBackfill({
    pool,
    isReady: () => true,
    random: () => 0.999,
    selectSender: () => selectedSender,
    prepareLookup: async item => prepared.push(item),
    sendCommand: (command, _item, sender) => {
      assert.equal(sender, selectedSender, 'one randomly selected account sends the whole lookup batch');
      sent.push(command);
      return true;
    },
    commandDelayMs: 25,
    sleep: async delay => delays.push(delay),
    onLog: () => {},
    onError: error => { throw error; }
  });

  const result = await backfill.run();
  assert.deepEqual(sent, ['!pt PartialPlayer', '!seen PartialPlayer']);
  assert.deepEqual(prepared.map(item => item.metric), ['playtime', 'lastSeen']);
  assert.deepEqual(delays, [25]);
  assert.deepEqual(result, { skipped: false, sent: 2, total: 2 });
}

async function testOfflineRunDoesNotQueryDatabase() {
  let queried = false;
  const backfill = createPlayerInfoBackfill({
    pool: { async query() { queried = true; return { rows: [] }; } },
    isReady: () => false,
    onLog: () => {}
  });
  assert.deepEqual(
    await backfill.run(),
    { skipped: true, reason: 'minecraft-unavailable', sent: 0 }
  );
  assert.equal(queried, false);
}

Promise.resolve()
  .then(testOnlyMissingMetricsBecomeCommands)
  .then(testAutomaticCommandsAreMirroredToPublicChat)
  .then(testScheduleMigrationIsSharedByBotAndSite)
  .then(testRandomSenderUsesOnlyConnectedAccounts)
  .then(testScheduleUsesIrregularRanges)
  .then(testRedeployRestoresTheSameRandomizedSlot)
  .then(testNextSlotIsPersistedBeforeCommandsRun)
  .then(testDatabaseQueryUsesAllPlayerSourcesAndUuidIdentity)
  .then(testRunPreparesAndThrottlesCommands)
  .then(testOfflineRunDoesNotQueryDatabase)
  .then(() => console.log('Player info backfill tests passed.'));
