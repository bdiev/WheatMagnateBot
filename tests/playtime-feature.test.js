'use strict';

const assert = require('assert');
const fs = require('node:fs');
const path = require('node:path');
const { createPlaytimeFeature } = require('../features/playtime');

async function run() {
  const queries = [];
  const pool = {
    async query(sql, params = []) {
      queries.push({ sql, params });
      if (/FROM deduplicated/.test(sql)) {
        return { rows: [{ username: 'Player', total_seconds: 120 }] };
      }
      if (/FROM player_playtime pt/.test(sql)) {
        return { rows: [{ username: 'Visitor', total_seconds: 3600 }] };
      }
      return { rows: [] };
    }
  };
  const feature = createPlaytimeFeature({
    pool,
    getOnlinePlayerUsernames: () => [],
    getPlayerHeadEmoji: () => '',
    statusEmojis: { playtime: '' },
    uiButtonEmojis: { slowFalling: '🔄', search: '🔍' }
  });

  const result = await feature.getWhitelistPlaytime();
  const searchResult = await feature.searchNonWhitelistPlaytime('vis', 100);
  const setResult = await feature.setPlayerPlaytime('OldPlayerName', 42);
  const componentIds = feature.buildPlaytimeComponents().map(row => row.components.map(component => component.data.custom_id));
  const searchComponentIds = feature.buildPlaytimeComponents({ showBack: true })[0].components.map(component => component.data.custom_id);

  assert.equal(
    feature.parsePlaytime('20 days 15 hours 19 minutes 30 seconds. [329/50368]'),
    1_783_170,
    'rank metadata in a live !pt response must not prevent synchronization'
  );
  assert.equal(
    feature.parsePlaytime('20 days 15 hours unexpected text'),
    null,
    'arbitrary trailing text must remain invalid'
  );

  assert.deepStrictEqual(result.players, [{ username: 'Player', total_seconds: 120 }]);
  assert.deepStrictEqual(searchResult.players, [{ username: 'Visitor', total_seconds: 3600 }]);
  assert.deepStrictEqual(setResult, { username: 'OldPlayerName' });
  assert.match(
    queries[0].sql,
    /pt\.player_uuid = COALESCE\(w\.player_uuid, pa\.player_uuid\)/,
    'whitelist playtime must join the profile by UUID'
  );
  assert.match(queries[1].sql, /player_name_history searched_name/, 'old nicknames must find the current UUID-owned playtime row');
  assert.match(queries[1].sql, /NOT EXISTS[\s\S]*FROM whitelist w/, 'non-whitelist search must exclude whitelist members');
  assert.deepStrictEqual(queries[1].params, ['%vis%', 25], 'search must use a parameterized query and cap results at 25');
  assert.match(queries[2].sql, /player_name_history pnh/, 'setting PT by an old nickname must resolve its UUID');
  assert.match(queries[2].sql, /WHERE pt\.player_uuid = \(SELECT player_uuid FROM identity\)/);
  assert.deepStrictEqual(componentIds, [
    ['playtime_period_all', 'playtime_period_30d', 'playtime_period_7d'],
    ['playtime_non_whitelist_search']
  ]);
  assert.deepStrictEqual(searchComponentIds, ['playtime_period_all', 'playtime_non_whitelist_search'],
    'search results must offer a way back to the whitelist table');

  const leaderboardRows = Array.from({ length: 45 }, (_, index) => ({
    username: `Player${String(index).padStart(2, '0')}`,
    total_seconds: 100_000 - index,
    week_seconds: index === 44 ? 7_200 : 0,
    month_seconds: index % 2 === 0 ? 3_600 + index : 0,
    history_since: new Date(Date.now() - 3 * 86_400_000)
  }));
  const leaderboardFeature = createPlaytimeFeature({
    pool: { async query() { return { rows: leaderboardRows }; } },
    getOnlinePlayerUsernames: () => ['player01'],
    getPlayerHeadEmoji: () => '',
    statusEmojis: { playtime: '' },
    uiButtonEmojis: { slowFalling: 'sync', search: 'search' }
  });
  const firstPage = await leaderboardFeature.buildWhitelistPlaytimeMessage();
  assert.equal(firstPage.embeds[0].description.split('\n').length, 20, 'pages hold 20 players instead of cutting the list at 50');
  assert.match(firstPage.embeds[0].description, /\*\*Player01\*\* 🟢/, 'online players are marked');
  assert.equal(firstPage.embeds[0].footer.text, 'Page 1/3');
  assert.deepStrictEqual(firstPage.components[1].components.map(component => component.data.custom_id),
    ['playtime_page_all_0', 'playtime_page_all_1', 'playtime_non_whitelist_search']);
  const lastPage = await leaderboardFeature.buildWhitelistPlaytimeMessage({ period: 'all', page: 99 });
  assert.match(lastPage.embeds[0].description, /^`41\.`/, 'an out-of-range page clamps to the last page');
  assert.match(lastPage.embeds[0].description, /Player44\*\* - `1d 3h 45m`$/, 'all-time rows show only the total, without a weekly gain');
  const monthView = await leaderboardFeature.buildWhitelistPlaytimeMessage({ period: '30d' });
  assert.match(monthView.embeds[0].title, /30 days · 23 players/, 'period views list only players with playtime in that period');
  assert.match(monthView.embeds[0].description, /^`01\.` {2}\*\*Player44\*\* - `1h 0m`/, 'period views rank by period playtime');
  assert.match(monthView.embeds[0].footer.text, /Daily history since/, 'periods longer than the recorded history say so');
  assert.equal(leaderboardFeature.normalizePlaytimePeriod('bogus'), 'all');

  const dailyQueries = [];
  const dailyFeature = createPlaytimeFeature({
    pool: {
      async connect() {
        return {
          async query(sql) {
            if (/WITH elapsed AS/.test(sql)) {
              return { rows: [
                { username_key: 'alpha', still_tracking: true, identity_key: 'uuid-a', whole_seconds: '30' },
                { username_key: 'gone', still_tracking: false, identity_key: 'gone', whole_seconds: '0' }
              ] };
            }
            return { rows: [] };
          },
          release() {}
        };
      },
      async query(sql, params) {
        dailyQueries.push({ sql: String(sql), params });
        return { rows: [] };
      }
    },
    getOnlinePlayerUsernames: () => [],
    getPlayerHeadEmoji: () => '',
    statusEmojis: { playtime: '' },
    uiButtonEmojis: { slowFalling: 'sync', search: 'search' }
  });
  await dailyFeature.syncWhitelistPlaytime(['Alpha']);
  assert.equal(dailyQueries.length, 1);
  assert.match(dailyQueries[0].sql, /INSERT INTO player_playtime_daily/);
  assert.deepStrictEqual(dailyQueries[0].params, [['uuid-a'], [30]], 'only credited seconds are added to the daily slice');

  const syncQueries = [];
  let syncConnections = 0;
  const syncClient = {
    async query(sql, params = []) {
      syncQueries.push({ sql:String(sql), params });
      return { rows: [] };
    },
    release() {}
  };
  const syncFeature = createPlaytimeFeature({
    pool: {
      async connect() {
        syncConnections += 1;
        return syncClient;
      }
    },
    getOnlinePlayerUsernames: () => [],
    getPlayerHeadEmoji: () => '',
    statusEmojis: { playtime: '' },
    uiButtonEmojis: { slowFalling: 'sync', search: 'search' }
  });
  const skippedEmpty = await syncFeature.syncWhitelistPlaytime([]);
  assert.deepStrictEqual(skippedEmpty, { skipped:true, reason:'empty-snapshot' });
  assert.equal(syncConnections, 0, 'a transient empty TAB snapshot must not stop every active timer');

  const synchronized = await syncFeature.syncWhitelistPlaytime(['Player', 'PLAYER']);
  assert.deepStrictEqual(synchronized, { synchronized:true, onlineCount:1 });
  assert.equal(syncConnections, 1);
  assert.match(syncQueries[1].sql, /tracking_since = CASE[\s\S]*pt\.tracking_since \+ elapsed\.whole_seconds \* INTERVAL '1 second'/,
    'checkpoints must carry their sub-second remainder instead of discarding it');
  assert.deepStrictEqual(syncQueries[1].params, [['player']]);
  assert.match(syncQueries[2].sql, /tracking_since = COALESCE\(pt\.tracking_since, NOW\(\)\)/,
    'an already-online player must retain the remainder-preserving tracking timestamp');

  const finalized = await syncFeature.syncWhitelistPlaytime([], { allowEmptySnapshot:true });
  assert.deepStrictEqual(finalized, { synchronized:true, onlineCount:0 });
  assert.equal(syncConnections, 2, 'an explicit disconnect must still finalize every active timer');

  // A burst of join events (the whole TAB list on connect) must not queue one
  // full sync per player: only the newest waiting snapshot is written.
  const burstSnapshots = [];
  let releaseFirstSync;
  const firstSyncGate = new Promise(resolve => { releaseFirstSync = resolve; });
  let burstConnections = 0;
  const burstFeature = createPlaytimeFeature({
    pool: {
      async connect() {
        burstConnections += 1;
        const connection = burstConnections;
        return {
          async query(sql, params = []) {
            if (connection === 1 && /BEGIN/.test(sql)) await firstSyncGate;
            if (/WITH elapsed AS/.test(sql)) {
              burstSnapshots.push(params[0]);
              return { rows: [{ username_key: 'alpha', still_tracking: true }] };
            }
            if (/INSERT INTO player_playtime/.test(sql)) burstSnapshots.push(`upsert:${params[0]}`);
            return { rows: [] };
          },
          release() {}
        };
      }
    },
    getOnlinePlayerUsernames: () => [],
    getPlayerHeadEmoji: () => '',
    statusEmojis: { playtime: '' },
    uiButtonEmojis: { slowFalling: 'sync', search: 'search' }
  });
  const inFlight = burstFeature.syncWhitelistPlaytime(['Alpha']);
  await new Promise(resolve => setImmediate(resolve));
  const queued = [
    burstFeature.syncWhitelistPlaytime(['Alpha', 'Beta']),
    burstFeature.syncWhitelistPlaytime(['Alpha', 'Beta', 'Gamma']),
    burstFeature.syncWhitelistPlaytime([], { allowEmptySnapshot:true })
  ];
  releaseFirstSync();
  await Promise.all([inFlight, ...queued]);
  assert.equal(burstConnections, 2, 'three waiting snapshots must collapse into one transaction');
  assert.deepStrictEqual(burstSnapshots, [['alpha'], []], 'the newest waiting snapshot (the disconnect flush) must win');

  const steadySnapshots = [];
  const steadyFeature = createPlaytimeFeature({
    pool: {
      async connect() {
        return {
          async query(sql, params = []) {
            if (/WITH elapsed AS/.test(sql)) return { rows: [{ username_key: 'alpha', still_tracking: true }, { username_key: 'gone', still_tracking: false }] };
            if (/INSERT INTO player_playtime/.test(sql)) steadySnapshots.push(params[0]);
            return { rows: [] };
          },
          release() {}
        };
      }
    },
    getOnlinePlayerUsernames: () => [],
    getPlayerHeadEmoji: () => '',
    statusEmojis: { playtime: '' },
    uiButtonEmojis: { slowFalling: 'sync', search: 'search' }
  });
  await steadyFeature.syncWhitelistPlaytime(['Alpha', 'Beta']);
  assert.deepStrictEqual(steadySnapshots, ['Beta'], 'players whose timer carried over must not be written again');

  // A waiting disconnect flush must still stop every timer: a live snapshot
  // that arrives behind it queues after it instead of replacing it.
  const orderedSnapshots = [];
  let releaseOrderedSync;
  const orderedGate = new Promise(resolve => { releaseOrderedSync = resolve; });
  let orderedConnections = 0;
  const orderedFeature = createPlaytimeFeature({
    pool: {
      async connect() {
        orderedConnections += 1;
        const connection = orderedConnections;
        return {
          async query(sql, params = []) {
            if (connection === 1 && /BEGIN/.test(sql)) await orderedGate;
            if (/WITH elapsed AS/.test(sql)) orderedSnapshots.push(params[0]);
            return { rows: [] };
          },
          release() {}
        };
      }
    },
    getOnlinePlayerUsernames: () => [],
    getPlayerHeadEmoji: () => '',
    statusEmojis: { playtime: '' },
    uiButtonEmojis: { slowFalling: 'sync', search: 'search' }
  });
  const orderedInFlight = orderedFeature.syncWhitelistPlaytime(['Alpha']);
  await new Promise(resolve => setImmediate(resolve));
  const orderedFlush = orderedFeature.syncWhitelistPlaytime([], { allowEmptySnapshot:true });
  const orderedLive = orderedFeature.syncWhitelistPlaytime(['Beta']);
  releaseOrderedSync();
  await Promise.all([orderedInFlight, orderedFlush, orderedLive]);
  assert.deepStrictEqual(orderedSnapshots, [['alpha'], [], ['beta']], 'a live snapshot must not swallow a waiting flush');

  const finalQueries = [];
  const finalFeature = createPlaytimeFeature({
    pool: { async connect() { return { async query(sql) { finalQueries.push(String(sql)); return { rows: [] }; }, release() {} }; } },
    getOnlinePlayerUsernames: () => [],
    getPlayerHeadEmoji: () => '',
    statusEmojis: { playtime: '' },
    uiButtonEmojis: { slowFalling: 'sync', search: 'search' }
  });
  await finalFeature.syncWhitelistPlaytime([], { allowEmptySnapshot:true, final:true });
  const afterFinal = await finalFeature.syncWhitelistPlaytime(['Alpha']);
  assert.deepStrictEqual(afterFinal, { skipped:true, reason:'closed' }, 'nothing may restart PT timers after the shutdown flush');
  assert.equal(finalQueries.filter(sql => /WITH elapsed AS/.test(sql)).length, 1);

  const botSource = fs.readFileSync(path.resolve(__dirname, '..', 'bot.js'), 'utf8');
  assert.match(botSource, /bot\.on\('playerJoined'[\s\S]*?if \(player\.username && bot === createdBot\) \{[\s\S]*?syncWhitelistPlaytime\(onlineUsernames\)/,
    'a join handler that outlives its connection must not restart PT timers after the disconnect flush');
  assert.match(botSource, /bot\.on\('playerLeft'[\s\S]*?if \(player\.username && bot === createdBot\) \{[\s\S]*?syncWhitelistPlaytime\(onlineUsernames\)/);
  const nixpacksSource = fs.readFileSync(path.resolve(__dirname, '..', 'nixpacks.toml'), 'utf8');
  assert.match(botSource, /playtime_non_whitelist_search_modal[\s\S]*playtime_search_query/, 'the search button must open a nickname modal');
  assert.match(botSource, /searchNonWhitelistPlaytime\(query, 25\)/, 'the modal must run the non-whitelist playtime search');
  assert.match(botSource, /buildNonWhitelistPlaytimeSearchEmbed\(query, result\)/, 'search results must render in the playtime message');
  assert.match(botSource, /preparePrimaryBotForShutdown\(\)[\s\S]*?syncWhitelistPlaytime\(\[\], \{ allowEmptySnapshot: true, final: true \}\)[\s\S]*?safelyCloseMinecraftBot\(bot, 'Process shutdown'\)[\s\S]*?pool\?\.end/,
    'redeploy shutdown must stop farm work, flush PT, disconnect Minecraft, and only then close the database');
  assert.match(botSource, /preparePrimaryBotForShutdown\(\)[\s\S]*?resumeAfterRedeploy[\s\S]*?obsidianStats\.desiredEnabled = true;[\s\S]*?setObsidianFarmDesiredEnabled\(true\)[\s\S]*?primaryProtectionLever\.setState\(currentBot, true\)/,
    'redeploy shutdown must protect the primary farm while preserving its resume intent');
  assert.match(botSource, /ensureObsidianFarmRunning\(createdBot[\s\S]*?!obsidianStats\.desiredEnabled[\s\S]*?setProtectionLeverState\(false\)[\s\S]*?farm\.prepareStart\(createdBot\)[\s\S]*?farm\.resume\(createdBot, farmNotification\)/,
    'the primary farm must reopen its lever and resume after the replacement process reconnects');
  assert.match(botSource, /runtime\.flushFarmPersistence = \(\) => managedFarmWriteQueue[\s\S]*?managedPersistence[\s\S]*?context\.flushFarmPersistence\(\)/,
    'redeploy shutdown must flush the preserved resume intent for managed farms');
  assert.match(botSource, /SHUTDOWN_FARM_SETTLE_MS = 3_000[\s\S]*?farmSettlePromise[\s\S]*?sleep\(SHUTDOWN_FARM_SETTLE_MS\)[\s\S]*?await Promise\.all\(\[managedPersistencePromise, farmSettlePromise\]\)[\s\S]*?safelyCloseMinecraftBot\(bot, 'Process shutdown'\)/,
    'protected farm levers must remain engaged for at least three seconds before Minecraft disconnects');
  assert.match(nixpacksSource, /\[start\][\s\S]*?cmd\s*=\s*["']exec node bot\.js["']/,
    'Coolify/Nixpacks must exec Node directly so SIGTERM reaches the shutdown handlers');
  console.log('playtime feature tests passed');
}

run().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
