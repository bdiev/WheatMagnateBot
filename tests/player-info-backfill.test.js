'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  buildMissingCommands,
  createPlayerInfoBackfill,
  loadMissingPlayerInfo
} = require('../features/playerInfoBackfill');

function testOnlyMissingMetricsBecomeCommands() {
  assert.deepEqual(buildMissingCommands([
    { username: 'HasJD', missing_playtime: true, missing_join_date: false, missing_last_seen: true },
    { username: 'HasSeen', missing_playtime: true, missing_join_date: true, missing_last_seen: false },
    { username: 'HasPT', missing_playtime: false, missing_join_date: true, missing_last_seen: true },
    { username: 'Complete', missing_playtime: false, missing_join_date: false, missing_last_seen: false }
  ]), [
    { metric: 'playtime', username: 'HasJD', command: '!pt HasJD' },
    { metric: 'lastSeen', username: 'HasJD', command: '!seen HasJD' },
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
    /sendCommand:\s*command\s*=>\s*\{[\s\S]*?sendMinecraftChat\(command\)[\s\S]*?sendGameChatMessageToDiscord\(bot\.username \|\| 'WheatMagnate', command,[\s\S]*?source:\s*'player-info-backfill'/,
    'automatic player-info commands must appear in the shared game chat without relying on their suppressed self echo'
  );
}

async function testDatabaseQueryUsesAllPlayerSourcesAndUuidIdentity() {
  let query = '';
  const rows = [{ username: 'Player', missing_playtime: true, missing_join_date: false, missing_last_seen: false }];
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
  assert.match(query, /WHERE missing_playtime OR missing_join_date OR missing_last_seen/);
  assert.match(query, /ORDER BY RANDOM\(\)\s+LIMIT 1/);
}

async function testRunPreparesAndThrottlesCommands() {
  const sent = [];
  const prepared = [];
  const delays = [];
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
    prepareLookup: async item => prepared.push(item),
    sendCommand: command => {
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
  .then(testDatabaseQueryUsesAllPlayerSourcesAndUuidIdentity)
  .then(testRunPreparesAndThrottlesCommands)
  .then(testOfflineRunDoesNotQueryDatabase)
  .then(() => console.log('Player info backfill tests passed.'));
