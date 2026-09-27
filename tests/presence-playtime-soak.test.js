'use strict';

// Long-running soak for online presence and playtime accounting.
//
// A seeded discrete-event simulation runs days of virtual time against an
// in-process Postgres (PGlite) with the production schema. Everything that
// touches the data is the shipped code: the player activity repository, the
// playtime feature, the site's presence-lease expiry, the startup timer reset,
// and the bot's own playerJoined / playerLeft / end handlers, spawn sync block
// and presence sync, which are lifted from bot.js and run in a VM context with
// virtual timers. Only the Minecraft server, the process supervisor and the
// network are simulated: player churn, database latency spikes, kicks (some
// right after spawn), crashes (process killed mid-transaction), graceful
// redeploys and the daily server restart.
//
//   npm run test:soak         12 virtual hours, seed 1, plus mutation runs
//   npm run test:soak:long    7 virtual days on three seeds
//   node tests/presence-playtime-soak.test.js --hours=48 --seeds=4,5 --players=12 --no-mutation
// Environment variables SOAK_HOURS, SOAK_SEEDS, SOAK_PLAYERS and
// SOAK_MUTATION=0 work too; SOAK_DEBUG=1 prints the event timeline before the
// first failure and SOAK_TRACE=<username> adds that player's presence writes.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { PGlite } = require('@electric-sql/pglite');
const { createPlayerActivityRepository } = require('../database');
const { createPlaytimeFeature } = require('../features/playtime');
const { expireStalePlayerPresence, buildPlayerGameSessions } = require('../site/server');

const ARGS = Object.fromEntries(process.argv.slice(2).map(arg => {
  const [key, value = 'true'] = arg.replace(/^--/, '').split('=');
  return [key, value];
}));
const HOURS = Number(ARGS.hours ?? process.env.SOAK_HOURS) || 12;
const SEEDS = String(ARGS.seeds ?? process.env.SOAK_SEEDS ?? '1').split(',').map(Number).filter(Number.isFinite);
const RUN_MUTATION = !ARGS['no-mutation'] && process.env.SOAK_MUTATION !== '0';
const PLAYER_COUNT = Number(ARGS.players ?? process.env.SOAK_PLAYERS) || 8;
const START_MS = Date.parse('2026-09-01T00:00:00.000Z');
const PRESENCE_TIMEOUT_MS = 30_000;
const PRESENCE_SWEEP_MS = 15_000;
const RECONNECT_MS = 15_000;
const SHUTDOWN_FLUSH_TIMEOUT_MS = 5_000;
// Allowed drift per observed transition (join, leave, connect, disconnect):
// the write lands after database latency, including queued spikes.
const TRANSITION_SLACK_S = 8;
// A crash loses at most the time since the last 30 s checkpoint.
const CRASH_SLACK_S = 32;

// ---------------------------------------------------------------- source ---

const BOT_SOURCE = fs.readFileSync(path.join(__dirname, '..', 'bot.js'), 'utf8');

function topLevelFunction(name) {
  const match = new RegExp(`\\n((?:async )?function ${name}\\([\\s\\S]*?\\n\\})\\r?\\n`).exec(BOT_SOURCE);
  assert.ok(match, `bot.js must define ${name}`);
  return match[1];
}

function botHandler(event) {
  const match = new RegExp(`\\n  bot\\.on\\('${event}', (async )?\\((\\w*)\\) => \\{([\\s\\S]*?)\\r?\\n  \\}\\);`).exec(BOT_SOURCE);
  assert.ok(match, `bot.js must handle ${event}`);
  return `${match[1] || ''}(${match[2]}) => {${match[3]}\n}`;
}

function spawnSyncBlock() {
  const match = /\n( {4}\/\/ Keep website online\/offline state aligned[\s\S]*?playtimeSyncInterval = setInterval\([\s\S]*?\}, 30_000\);)/.exec(BOT_SOURCE);
  assert.ok(match, 'bot.js must start presence and playtime sync after spawn');
  return match[1];
}

function spawnResetBlock() {
  assert.match(BOT_SOURCE, /bot\.on\('spawn'[\s\S]*?playerActivityJoinEventsReady = false;\s*playerActivityReconciliationPending = true;[\s\S]*?clearIntervals\(\);/,
    'spawn must reset readiness before restarting the sync intervals');
}

function startupResetSql() {
  const match = /pool\.query\('(UPDATE player_playtime SET tracking_since = NULL WHERE tracking_since IS NOT NULL)'\)/.exec(BOT_SOURCE);
  assert.ok(match, 'process startup must stop timers a crashed process left running');
  return match[1];
}

function bootstrapDdl() {
  const start = BOT_SOURCE.indexOf('async function initDatabase()');
  const body = BOT_SOURCE.slice(start, BOT_SOURCE.indexOf('\n}\n', start));
  return [...body.matchAll(/pool\.query\(\s*(?:`([^`]*)`|'([^']*)')/g)]
    .map(match => match[1] ?? match[2])
    .filter(sql => /^\s*(CREATE|ALTER|DO)\b/.test(sql) && !sql.includes('${') && !/TEMP TABLE/.test(sql));
}

// The graceful shutdown path is not lifted (it drives the whole process), so
// pin the order the simulation replays.
assert.match(BOT_SOURCE, /shouldReconnect = false;[\s\S]*?withTimeout\(\s*syncWhitelistPlaytime\(\[\], \{ allowEmptySnapshot: true \}\),\s*5_000/,
  'redeploy must flush playtime with a 5 s deadline');
assert.match(BOT_SOURCE, /const RECONNECT_INTERVAL_MS = 15_000;/);

const LIFTED = {
  addObservedOnlineUsername: topLevelFunction('addObservedOnlineUsername'),
  getOnlinePlayerUsernames: topLevelFunction('getOnlinePlayerUsernames'),
  getOnlinePlayerUuid: topLevelFunction('getOnlinePlayerUuid'),
  syncPlayerActivityOnlineState: topLevelFunction('syncPlayerActivityOnlineState'),
  reconcileStaleOnlinePlayers: topLevelFunction('reconcileStaleOnlinePlayers'),
  playerJoined: botHandler('playerJoined'),
  playerLeft: botHandler('playerLeft'),
  end: botHandler('end'),
  spawnSync: spawnSyncBlock(),
  startupReset: startupResetSql()
};
spawnResetBlock();

// ------------------------------------------------------------ utilities ---

function createRandom(seed) {
  let state = (seed >>> 0) || 1;
  const next = () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5; state >>>= 0;
    return state / 4294967296;
  };
  return {
    next,
    between: (min, max) => min + (max - min) * next(),
    int: (min, max) => Math.floor(min + (max - min + 1) * next()),
    chance: probability => next() < probability,
    exp: mean => -Math.log(1 - next()) * mean
  };
}

function uuidFor(index) {
  const hex = (index + 1).toString(16).padStart(12, '0');
  return `5a0c0000-0000-4000-8000-${hex}`;
}

// ------------------------------------------------------------ scheduler ---

function createScheduler(clock) {
  const queue = [];
  let sequence = 0;
  let executing = 0;

  function at(time, fn, owner = null) {
    const timer = { time: Math.max(time, clock.now), sequence: sequence++, fn, owner, cancelled: false };
    let low = 0;
    let high = queue.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      const other = queue[mid];
      if (other.time < timer.time || (other.time === timer.time && other.sequence < timer.sequence)) low = mid + 1;
      else high = mid;
    }
    queue.splice(low, 0, timer);
    return timer;
  }

  const after = (ms, fn, owner) => at(clock.now + Math.max(0, ms), fn, owner);
  const sleep = (ms, owner) => new Promise(resolve => after(ms, resolve, owner));

  function cancelOwner(owner) {
    for (const timer of queue) if (timer.owner === owner) timer.cancelled = true;
  }

  // Let promise chains and PGlite work run until everything left is waiting
  // on virtual time.
  async function settle() {
    let idle = 0;
    while (idle < 3) {
      await new Promise(resolve => setImmediate(resolve));
      idle = executing > 0 ? 0 : idle + 1;
    }
  }

  async function runUntil(time) {
    while (queue.length && queue[0].time <= time) {
      const timer = queue.shift();
      if (timer.cancelled) continue;
      clock.now = timer.time;
      timer.fn();
      await settle();
    }
    clock.now = time;
  }

  return {
    at, after, sleep, cancelOwner, settle, runUntil,
    trackExecution: async work => {
      executing += 1;
      try { return await work(); } finally { executing -= 1; }
    }
  };
}

// ------------------------------------------------------------- database ---

// One PGlite session stands in for the server. Connections are serialized
// by a lock held from connect() to release(), so transactions never mix;
// every statement pays simulated network latency first, so independent flows
// still interleave between statements. A killed process never resumes: its
// timers are cancelled and an open transaction is rolled back.
function createDatabaseServer(db, scheduler, clock, random) {
  let holder = null;
  const waiters = [];

  // Pool checkout and standalone statements see pool waits and network
  // spikes; statements inside an open transaction reuse a warm connection.
  // (The model serializes transactions, so lock time must stay realistic.)
  const latency = () => (random.chance(0.03) ? random.between(200, 3000) : random.between(1, 25));
  const transactionLatency = () => random.between(0.3, 3);

  async function execute(sql, params = []) {
    const literal = `TIMESTAMPTZ '${new Date(clock.now).toISOString()}'`;
    const text = String(sql).replace(/NOW\(\)/gi, literal);
    return scheduler.trackExecution(async () => {
      if (params.length) {
        const result = await db.query(text, params);
        return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
      }
      const results = await db.exec(text);
      const last = results.at(-1) || { rows: [] };
      return { rows: last.rows || [], rowCount: last.affectedRows ?? (last.rows || []).length };
    });
  }

  async function acquire(owner) {
    while (holder) await new Promise(resolve => waiters.push(resolve));
    holder = owner;
  }

  function release(owner) {
    if (holder !== owner) return;
    holder = null;
    waiters.shift()?.();
  }

  function terminated() {
    const error = new Error('process terminated');
    error.terminated = true;
    return error;
  }

  function poolFor(owner) {
    const checkAlive = () => { if (!owner.alive) throw terminated(); };
    return {
      async query(sql, params) {
        await scheduler.sleep(latency(), owner);
        checkAlive();
        await acquire(owner);
        try {
          checkAlive();
          return await execute(sql, params);
        } finally {
          release(owner);
        }
      },
      async connect() {
        await scheduler.sleep(latency(), owner);
        checkAlive();
        await acquire(owner);
        if (!owner.alive) { release(owner); throw terminated(); }
        let released = false;
        return {
          async query(sql, params) {
            await scheduler.sleep(transactionLatency(), owner);
            checkAlive();
            return execute(sql, params);
          },
          release() {
            if (released) return;
            released = true;
            release(owner);
          }
        };
      }
    };
  }

  async function kill(owner) {
    owner.alive = false;
    scheduler.cancelOwner(owner);
    if (holder === owner) {
      await execute('ROLLBACK').catch(() => {});
      release(owner);
    }
  }

  // Latency-free access for assertions. It waits for the lock so checks only
  // ever see committed state, never another flow's half-done transaction.
  const inspector = { alive: true };
  const inspect = async (sql, params) => {
    await acquire(inspector);
    try {
      return await execute(sql, params);
    } finally {
      release(inspector);
    }
  };
  return { poolFor, kill, inspect };
}

// Schema setup runs without the virtual clock (defaults must stay NOW()).
// PGlite ships no pgcrypto; gen_random_uuid() is built into Postgres 13+.
async function createSchema(db) {
  const inspect = async (sql, params = []) => {
    if (params.length) {
      const result = await db.query(sql, params);
      return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
    }
    const results = await db.exec(String(sql).replace(/CREATE EXTENSION IF NOT EXISTS pgcrypto;?/gi, ''));
    const last = results.at(-1) || { rows: [] };
    return { rows: last.rows || [], rowCount: last.affectedRows ?? (last.rows || []).length };
  };
  await inspect("SET TIME ZONE 'UTC'");
  const pool = { query: inspect, connect: async () => ({ query: inspect, release() {} }) };
  const ddl = bootstrapDdl();
  const runDdl = async () => { for (const sql of ddl) await inspect(sql).catch(() => {}); };
  await runDdl();
  // A fresh database cannot replay every migration (some extend tables that
  // other services create), so apply each file on its own and then verify the
  // columns this soak depends on.
  for (const directory of ['database/migrations', 'site/migrations']) {
    const folder = path.join(__dirname, '..', directory);
    for (const name of fs.readdirSync(folder).filter(file => file.endsWith('.sql')).sort()) {
      await inspect('BEGIN');
      try {
        await inspect(fs.readFileSync(path.join(folder, name), 'utf8'));
        await inspect('COMMIT');
      } catch {
        await inspect('ROLLBACK');
      }
    }
  }
  await runDdl();
  const required = {
    player_activity: ['player_uuid', 'is_online', 'online_since', 'presence_observed_at', 'last_seen', 'observed_message_count', 'admin_tags'],
    player_name_history: ['player_uuid', 'username', 'first_seen', 'last_seen'],
    player_session_events: ['username', 'event_type', 'occurred_at'],
    player_playtime: ['username', 'player_uuid', 'total_seconds', 'tracking_since'],
    game_chat_messages: ['player_uuid', 'username']
  };
  for (const [table, columns] of Object.entries(required)) {
    const result = await inspect('SELECT column_name FROM information_schema.columns WHERE table_name = $1', [table]);
    const present = new Set(result.rows.map(row => row.column_name));
    for (const column of columns) assert.ok(present.has(column), `schema bootstrap must create ${table}.${column}`);
  }
}

// ---------------------------------------------------------------- world ---

function createIntervals() {
  const closed = [];
  let openedAt = null;
  return {
    open(time) { if (openedAt == null) openedAt = time; },
    close(time) { if (openedAt != null) { closed.push([openedAt, time]); openedAt = null; } },
    isOpen: () => openedAt != null,
    list(until) { return openedAt == null ? closed : [...closed, [openedAt, until]]; }
  };
}

function overlapSeconds(first, second) {
  let total = 0;
  let j = 0;
  for (const [start, end] of first) {
    while (j < second.length && second[j][1] <= start) j += 1;
    for (let k = j; k < second.length && second[k][0] < end; k += 1) {
      total += Math.max(0, Math.min(end, second[k][1]) - Math.max(start, second[k][0]));
    }
  }
  return total / 1000;
}

// ------------------------------------------------------------ simulation ---

async function simulate({ seed, hours, mutation = null, log = () => {} }) {
  const lifted = mutation ? mutation.apply({ ...LIFTED }) : LIFTED;
  const clock = { now: START_MS };
  const RealDate = global.Date;
  class VirtualDate extends RealDate {
    constructor(...args) {
      if (args.length) super(...args);
      else super(clock.now);
    }
    static now() { return clock.now; }
  }

  const random = createRandom(seed);
  const scheduler = createScheduler(clock);
  const db = new PGlite();
  const server = createDatabaseServer(db, scheduler, clock, random);
  const endAt = START_MS + hours * 3600_000;

  const errors = [];
  const originalConsole = { log: console.log, warn: console.warn, error: console.error };
  const failures = [];
  const stats = { crashes: 0, redeploys: 0, kicks: 0, earlyKicks: 0, restarts: 0, spawns: 0, joins: 0, leaves: 0, checks: 0 };

  const players = Array.from({ length: PLAYER_COUNT }, (_, index) => ({
    index,
    username: `SoakPlayer${String(index + 1).padStart(2, '0')}`,
    uuid: uuidFor(index),
    online: createIntervals(),
    transitions: 0,
    crashesWhileOnline: 0
  }));
  const botName = 'SoakBot';
  const observing = createIntervals();
  let serverUp = true;
  let lastWorldChange = START_MS;
  let lastObservingChange = START_MS;
  let currentProcess = null;
  let processSerial = 0;

  // A check that fails records the scenario and keeps going, so one run can
  // report every broken invariant.
  const timeline = [];
  const note = message => {
    timeline.push(`${new RealDate(clock.now).toISOString().slice(11, 23)} ${message}`);
    if (timeline.length > 60) timeline.shift();
  };
  const fail = message => {
    failures.push(`[seed ${seed} @ ${new RealDate(clock.now).toISOString()}] ${message}`);
    if (process.env.SOAK_DEBUG && failures.length === 1) originalConsole.error(`first failure: ${message}\n  ${timeline.join('\n  ')}`);
  };

  // -------------------------------------------------------- bot process ---

  function startProcess() {
    const owner = { alive: true, id: ++processSerial };
    const pool = server.poolFor(owner);
    const repository = createPlayerActivityRepository({ pool });
    const playtime = createPlaytimeFeature({
      pool,
      getOnlinePlayerUsernames: () => context.getOnlinePlayerUsernames(),
      getPlayerHeadEmoji: () => '',
      statusEmojis: {},
      uiButtonEmojis: {}
    });

    const timerHandle = timer => ({ timer, unref() {}, ref() {} });
    const context = vm.createContext({
      console: {
        log() {},
        warn() {},
        error: (...args) => {
          const text = args.map(String).join(' ');
          if (owner.alive && !/process terminated/.test(text)) errors.push(`process ${owner.id}: ${text}`);
        }
      },
      Date: VirtualDate,
      Promise,
      Object,
      String,
      Map,
      Set,
      Array,
      pool,
      bot: null,
      config: { username: botName },
      DEFAULT_ACCOUNT_ID: 'default',
      suppressDefaultAuthCachePersist: true,
      authCacheStore: { persist: async () => {} },
      multiAccountShuttingDown: false,
      shouldReconnect: true,
      lastObservedOnlinePlayerKeys: null,
      playerActivityJoinEventsReady: false,
      playerActivityReconciliationPending: true,
      playerActivitySyncRunning: false,
      playerActivitySyncInterval: null,
      playtimeSyncInterval: null,
      playerInfoFirstJoinCheck: null,
      updatePlayerActivity: async (username, isOnline, options = {}) => {
        const traced = process.env.SOAK_TRACE && String(username).toLowerCase() === process.env.SOAK_TRACE.toLowerCase();
        if (traced) note(`  p${owner.id} update ${username} ${isOnline ? 'online' : 'offline'} ${JSON.stringify(options)} start`);
        const result = await repository.updatePlayerActivity(username, isOnline, options);
        if (traced) note(`  p${owner.id} update ${username} ${isOnline ? 'online' : 'offline'} done`);
        return result;
      },
      syncWhitelistPlaytime: playtime.syncWhitelistPlaytime,
      dashedMinecraftUuid: value => String(value || '').toLowerCase() || null,
      schedulePlayerSkinHistoryRefresh() {},
      scheduleQueuedSiteWhispersForPlayer: () => scheduler.sleep(random.between(0, 40), owner),
      resetTpsTracking() {},
      recordFarmAnnotation: async () => {},
      recordSystemLog: async () => {},
      chatComponentToString: value => (value == null ? '' : String(value)),
      normalizeStatusReason: value => String(value || ''),
      setTimeout: (fn, ms) => timerHandle(scheduler.after(ms, fn, owner)),
      setInterval: (fn, ms) => {
        const handle = { cancelled: false, unref() {}, ref() {} };
        const tick = () => {
          if (handle.cancelled) return;
          handle.timer = scheduler.after(ms, tick, owner);
          fn();
        };
        handle.timer = scheduler.after(ms, tick, owner);
        return handle;
      },
      clearInterval: handle => { if (handle) { handle.cancelled = true; if (handle.timer) handle.timer.cancelled = true; } },
      clearTimeout: handle => { if (handle?.timer) handle.timer.cancelled = true; }
    });
    vm.runInContext([
      LIFTED.addObservedOnlineUsername,
      LIFTED.getOnlinePlayerUsernames,
      LIFTED.getOnlinePlayerUuid,
      lifted.syncPlayerActivityOnlineState,
      LIFTED.reconcileStaleOnlinePlayers,
      `function clearIntervals() {
        if (playtimeSyncInterval) { clearInterval(playtimeSyncInterval); playtimeSyncInterval = null; }
        if (playerActivitySyncInterval) { clearInterval(playerActivitySyncInterval); playerActivitySyncInterval = null; }
      }`
    ].join('\n'), context);

    const connectionFactory = vm.runInContext(`(function (createdBot, finalizeConnectionLoss) {
      return {
        playerJoined: ${lifted.playerJoined},
        playerLeft: ${lifted.playerLeft},
        end: ${LIFTED.end},
        spawn: () => {
          playerActivityJoinEventsReady = false;
          playerActivityReconciliationPending = true;
          clearIntervals();
          ${LIFTED.spawnSync}
        }
      };
    })`, context);

    const processState = { owner, context, connection: null, handlers: null, stopping: false };

    function connect() {
      if (!owner.alive || !context.shouldReconnect) return;
      if (!serverUp) {
        scheduler.after(RECONNECT_MS, connect, owner);
        return;
      }
      const loginMs = random.between(800, 4000);
      scheduler.after(loginMs, () => {
        if (!owner.alive) return;
        if (!serverUp) { scheduler.after(RECONNECT_MS, connect, owner); return; }
        const createdBot = { username: botName, entity: { id: 1 }, players: {}, tablist: { players: {} } };
        let finalized = false;
        const finalizeConnectionLoss = () => {
          if (finalized) return;
          finalized = true;
          if (context.bot !== createdBot) return;
          context.clearIntervals();
          context.bot = null;
          if (context.shouldReconnect) scheduler.after(RECONNECT_MS, connect, owner);
        };
        const handlers = connectionFactory(createdBot, finalizeConnectionLoss);
        context.bot = createdBot;
        processState.connection = createdBot;
        processState.handlers = handlers;
        stats.spawns += 1;
        note(`spawn (process ${owner.id})`);
        observing.open(clock.now);
        lastObservingChange = clock.now;
        markObservedTransitions();

        // The login player list arrives with the spawn: self first, then
        // everyone already online.
        createdBot.players[botName] = { username: botName, uuid: '5a0c0000-0000-4000-8000-ffffffffffff' };
        handlers.playerJoined(createdBot.players[botName]);
        for (const player of players) {
          if (!player.online.isOpen()) continue;
          createdBot.players[player.username] = { username: player.username, uuid: player.uuid };
          handlers.playerJoined(createdBot.players[player.username]);
        }
        handlers.spawn();

        if (processState.earlyKick) {
          processState.earlyKick = false;
          stats.earlyKicks += 1;
          scheduler.after(random.between(20, 3500), () => disconnect('Kicked right after spawn'), owner);
        }
      }, owner);
    }

    // The Minecraft connection ends (kick, network loss, server restart).
    function disconnect(reason = 'Connection lost') {
      const createdBot = processState.connection;
      if (!createdBot || context.bot !== createdBot || !owner.alive) return false;
      processState.connection = null;
      observing.close(clock.now);
      lastObservingChange = clock.now;
      note(`disconnect: ${reason}`);
      processState.handlers.end(reason);
      return true;
    }

    function playerJoined(player) {
      const createdBot = processState.connection;
      if (!createdBot || !owner.alive) return;
      createdBot.players[player.username] = { username: player.username, uuid: player.uuid };
      processState.handlers.playerJoined(createdBot.players[player.username]);
    }

    function playerLeft(player) {
      const createdBot = processState.connection;
      if (!createdBot || !owner.alive) return;
      const entry = createdBot.players[player.username];
      if (!entry) return;
      delete createdBot.players[player.username];
      processState.handlers.playerLeft(entry);
    }

    async function crash() {
      stats.crashes += 1;
      note(`crash process ${owner.id}`);
      if (processState.connection) {
        processState.connection = null;
        for (const player of players) if (player.online.isOpen()) player.crashesWhileOnline += 1;
        observing.close(clock.now);
        lastObservingChange = clock.now;
      }
      await server.kill(owner);
    }

    // SIGTERM: stop reconnecting, flush PT with a deadline, close Minecraft,
    // then exit shortly after.
    function redeploy() {
      stats.redeploys += 1;
      note(`redeploy process ${owner.id}`);
      processState.stopping = true;
      context.shouldReconnect = false;
      const flush = Promise.race([
        playtime.syncWhitelistPlaytime([], { allowEmptySnapshot: true }),
        scheduler.sleep(SHUTDOWN_FLUSH_TIMEOUT_MS, owner)
      ]);
      return flush.then(() => {
        if (!owner.alive) return;
        context.multiAccountShuttingDown = true;
        disconnect('Process shutdown');
        return scheduler.sleep(random.between(300, 2500), owner);
      }).then(() => server.kill(owner));
    }

    const ready = pool.query(LIFTED.startupReset).then(() => connect()).catch(() => {});
    Object.assign(processState, { connect, disconnect, playerJoined, playerLeft, crash, redeploy, ready, playtime, earlyKick: false });
    return processState;
  }

  // ------------------------------------------------------------- events ---

  const sitePool = server.poolFor({ alive: true, id: 'site' });
  const siteSweep = () => {
    expireStalePlayerPresence(sitePool, PRESENCE_TIMEOUT_MS)
      .catch(error => errors.push(`site: ${error.message}`));
    scheduler.after(PRESENCE_SWEEP_MS, siteSweep);
  };

  function schedulePlayer(player, first = false) {
    const offlineMs = first && random.chance(0.5)
      ? random.between(0, 60_000)
      : random.chance(0.1) ? random.between(2_000, 20_000) : random.exp(90 * 60_000) + 60_000;
    scheduler.after(offlineMs, () => joinPlayer(player));
  }

  function joinPlayer(player) {
    if (!serverUp) { scheduler.after(random.between(30_000, 600_000), () => joinPlayer(player)); return; }
    if (player.online.isOpen()) return;
    player.online.open(clock.now);
    lastWorldChange = clock.now;
    stats.joins += 1;
    note(`join ${player.username}`);
    if (observing.isOpen()) player.transitions += 1;
    currentProcess?.playerJoined(player);
    const sessionMs = random.chance(0.12) ? random.between(1_500, 25_000) : random.exp(70 * 60_000) + 30_000;
    player.leaveTimer = scheduler.after(sessionMs, () => leavePlayer(player));
  }

  function leavePlayer(player) {
    if (!player.online.isOpen()) return;
    player.online.close(clock.now);
    lastWorldChange = clock.now;
    stats.leaves += 1;
    note(`leave ${player.username}`);
    if (observing.isOpen()) player.transitions += 1;
    currentProcess?.playerLeft(player);
    schedulePlayer(player);
  }

  function markObservedTransitions() {
    for (const player of players) if (player.online.isOpen()) player.transitions += 1;
  }

  function scheduleServerRestart() {
    // Daily restart at 09:00 Kyiv (06:00 UTC in September).
    const day = Math.floor((clock.now - Date.UTC(2026, 8, 1, 6)) / 86_400_000) + 1;
    scheduler.at(Date.UTC(2026, 8, 1, 6) + day * 86_400_000, () => {
      stats.restarts += 1;
      serverUp = false;
      markObservedTransitions();
      currentProcess?.disconnect('Server restart');
      for (const player of players) {
        if (player.leaveTimer) player.leaveTimer.cancelled = true;
        if (player.online.isOpen()) {
          player.online.close(clock.now);
          schedulePlayer(player);
        }
      }
      lastWorldChange = clock.now;
      scheduler.after(random.between(90_000, 300_000), () => { serverUp = true; lastWorldChange = clock.now; });
      scheduleServerRestart();
    });
  }

  function scheduleIncident() {
    scheduler.after(random.exp(45 * 60_000) + 60_000, async () => {
      const roll = random.next();
      const process = currentProcess;
      if (process && process.owner.alive && !process.stopping) {
        if (roll < 0.35) {
          stats.kicks += 1;
          markObservedTransitions();
          if (random.chance(0.4)) process.earlyKick = true;
          process.disconnect('Kicked');
        } else if (roll < 0.65) {
          markObservedTransitions();
          await process.crash();
          scheduler.after(random.between(5_000, 90_000), () => { currentProcess = startProcess(); });
        } else if (roll < 0.9) {
          markObservedTransitions();
          const replacementDelay = random.between(10_000, 120_000);
          process.redeploy();
          scheduler.after(replacementDelay, () => { currentProcess = startProcess(); });
        } else {
          // Next connection gets kicked right after spawn, while the login
          // player list is still being written.
          process.earlyKick = true;
          if (process.connection) { stats.kicks += 1; markObservedTransitions(); process.disconnect('Kicked'); }
        }
      }
      scheduleIncident();
    });
  }

  // ------------------------------------------------------------- checks ---

  async function playtimeRows() {
    const result = await server.inspect(`
      SELECT LOWER(username) AS key, total_seconds::float8 AS saved,
             tracking_since,
             (total_seconds + CASE WHEN tracking_since IS NULL THEN 0
               ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - tracking_since)))) END)::float8 AS effective
      FROM player_playtime
    `);
    return new Map(result.rows.map(row => [row.key, row]));
  }

  const observedSeconds = player => overlapSeconds(player.online.list(clock.now), observing.list(clock.now));
  const overBudget = player => TRANSITION_SLACK_S * (player.transitions + 2);

  async function periodicCheck() {
    stats.checks += 1;
    const now = clock.now;
    const rows = await playtimeRows();
    for (const player of players) {
      const tracked = rows.get(player.username.toLowerCase())?.effective || 0;
      const expected = observedSeconds(player);
      if (tracked > expected + overBudget(player)) {
        fail(`${player.username} playtime ${tracked}s exceeds observed ${expected.toFixed(0)}s (+${overBudget(player)}s slack)`);
      }
    }

    const offlineFor = observing.isOpen() ? 0 : now - lastObservingChange;
    if (offlineFor >= 60_000) {
      const tracking = [...rows.values()].filter(row => row.tracking_since);
      if (tracking.length) fail(`bot offline ${Math.round(offlineFor / 1000)}s but PT timers run for ${tracking.map(row => row.key).join(', ')}`);
      const online = await server.inspect('SELECT username FROM player_activity WHERE is_online = TRUE');
      if (online.rows.length) fail(`bot offline ${Math.round(offlineFor / 1000)}s but ${online.rows.map(row => row.username).join(', ')} still shown online`);
    }

    const settled = observing.isOpen() && now - lastObservingChange >= 12_000 && now - lastWorldChange >= 5_000
      && currentProcess?.context.playerActivityJoinEventsReady;
    if (settled) {
      const online = await server.inspect("SELECT LOWER(username) AS key FROM player_activity WHERE is_online = TRUE AND LOWER(username) <> LOWER($1)", [botName]);
      const shown = online.rows.map(row => row.key).sort().join(',');
      const truth = players.filter(player => player.online.isOpen()).map(player => player.username.toLowerCase()).sort().join(',');
      if (shown !== truth) fail(`online list [${shown}] differs from the server [${truth}]`);
      const tracking = [...rows.values()].filter(row => row.tracking_since && row.key !== botName.toLowerCase()).map(row => row.key).sort().join(',');
      if (tracking !== truth) fail(`PT timers [${tracking}] differ from the online players [${truth}]`);
    }
    scheduler.after(random.between(20_000, 70_000), () => { periodicCheck().catch(error => errors.push(`check: ${error.stack}`)); });
  }

  // ---------------------------------------------------------------- run ---

  global.Date = VirtualDate;
  console.log = () => {};
  console.warn = () => {};
  console.error = (...args) => {
    const text = args.map(String).join(' ');
    if (!/process terminated/.test(text)) errors.push(text);
  };
  try {
    await createSchema(db);
    siteSweep();
    currentProcess = startProcess();
    players.forEach(player => schedulePlayer(player, true));
    scheduleServerRestart();
    scheduleIncident();
    scheduler.after(90_000, () => { periodicCheck().catch(error => errors.push(`check: ${error.stack}`)); });

    const hourMs = 3600_000;
    for (let time = START_MS + hourMs; time <= endAt; time += hourMs) {
      await scheduler.runUntil(time);
      log(`  seed ${seed}: ${Math.round((time - START_MS) / hourMs)}/${hours}h virtual, ${failures.length} failure(s)`);
    }

    // Final graceful shutdown, then compare the books.
    const last = currentProcess;
    if (last?.owner.alive) {
      markObservedTransitions();
      last.redeploy();
    }
    await scheduler.runUntil(clock.now + 30_000);
    const rows = await playtimeRows();
    const summary = [];
    let totalExpected = 0;
    let totalTracked = 0;
    for (const player of players) {
      const tracked = rows.get(player.username.toLowerCase())?.effective || 0;
      const expected = observedSeconds(player);
      totalExpected += expected;
      totalTracked += tracked;
      const over = tracked - expected;
      const underBudget = TRANSITION_SLACK_S * (player.transitions + 2) + CRASH_SLACK_S * player.crashesWhileOnline;
      if (over > overBudget(player)) fail(`final: ${player.username} overcounted by ${over.toFixed(0)}s`);
      if (-over > underBudget) fail(`final: ${player.username} undercounted by ${(-over).toFixed(0)}s (budget ${underBudget}s)`);
      summary.push({ player: player.username, expected: Math.round(expected), tracked: Math.round(tracked), drift: Math.round(over) });

      const events = await server.inspect(
        'SELECT event_type, occurred_at FROM player_session_events WHERE LOWER(username) = LOWER($1)',
        [player.username]
      );
      const sessions = buildPlayerGameSessions(events.rows, { limit: Infinity });
      const sessionSeconds = sessions.reduce((sum, session) => sum + session.durationSeconds, 0);
      player.sessionDrift = sessionSeconds - expected;
      summary[summary.length - 1].sessions = Math.round(sessionSeconds);
    }
    const tracking = [...rows.values()].filter(row => row.tracking_since);
    if (tracking.length) fail(`final: PT timers still running after shutdown for ${tracking.map(row => row.key).join(', ')}`);

    return { failures, errors, stats, summary, totalExpected, totalTracked, players };
  } finally {
    global.Date = RealDate;
    Object.assign(console, originalConsole);
    await db.close().catch(() => {});
  }
}

// ----------------------------------------------------------------- main ---

const replaceOnce = (source, from, to) => {
  assert.ok(source.includes(from), `mutation anchor missing: ${from}`);
  return source.replace(from, to);
};

const MUTATIONS = [
  {
    name: 'join/leave handlers without the connection guard',
    detects: /PT timers run|exceeds observed|overcounted/,
    apply: lifted => ({
      ...lifted,
      playerJoined: replaceOnce(lifted.playerJoined, 'if (player.username && bot === createdBot) {', 'if (player.username) {'),
      playerLeft: replaceOnce(lifted.playerLeft, 'if (player.username && bot === createdBot) {', 'if (player.username) {')
    })
  },
  {
    name: 'presence sync iterating map entries instead of keys',
    detects: /online list .* differs/,
    apply: lifted => ({
      ...lifted,
      syncPlayerActivityOnlineState: replaceOnce(lifted.syncPlayerActivityOnlineState, '[...lastObservedOnlinePlayerKeys.keys()]', '[...lastObservedOnlinePlayerKeys]')
    })
  }
];

async function main() {
  const startedAt = Date.now();
  let failed = false;
  for (const seed of SEEDS) {
    const result = await simulate({ seed, hours: HOURS, log: line => { if (HOURS > 24) console.log(line); } });
    const { stats, summary } = result;
    console.log(`seed ${seed}: ${HOURS}h virtual · spawns ${stats.spawns} · kicks ${stats.kicks} (early ${stats.earlyKicks}) · crashes ${stats.crashes} · redeploys ${stats.redeploys} · server restarts ${stats.restarts} · joins ${stats.joins} · checks ${stats.checks}`);
    console.log(`  playtime: expected ${Math.round(result.totalExpected)}s, tracked ${Math.round(result.totalTracked)}s, drift ${(result.totalTracked - result.totalExpected).toFixed(0)}s`);
    for (const row of summary) console.log(`  ${row.player}: observed ${row.expected}s · PT ${row.tracked}s (${row.drift >= 0 ? '+' : ''}${row.drift}s) · sessions ${row.sessions}s`);
    for (const failure of result.failures.slice(0, 25)) console.error(`  FAIL ${failure}`);
    if (result.failures.length > 25) console.error(`  ... ${result.failures.length - 25} more failure(s)`);
    for (const error of result.errors.slice(0, 10)) console.error(`  ERROR ${error}`);
    if (result.failures.length || result.errors.length) failed = true;
  }

  if (RUN_MUTATION) {
    // Put each pre-fix bug back into the lifted bot code: the harness must
    // notice it, or its green result above would mean nothing.
    for (const mutation of MUTATIONS) {
      const mutated = await simulate({ seed: SEEDS[0], hours: HOURS, mutation });
      const caught = mutated.failures.some(failure => mutation.detects.test(failure));
      console.log(`mutation (${mutation.name}): ${caught ? `caught, ${mutated.failures.length} failure(s)` : 'NOT caught'}`);
      if (!caught) failed = true;
    }
  }

  console.log(`presence/playtime soak ${failed ? 'FAILED' : 'passed'} in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
  if (failed) process.exitCode = 1;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
