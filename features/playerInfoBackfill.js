'use strict';

const DEFAULT_MIN_INTERVAL_MS = 2 * 60 * 60 * 1000;
const DEFAULT_MAX_INTERVAL_MS = 5 * 60 * 60 * 1000;
const DEFAULT_INITIAL_DELAY_MIN_MS = 5 * 60 * 1000;
const DEFAULT_INITIAL_DELAY_MAX_MS = 25 * 60 * 1000;
const DEFAULT_RETRY_DELAY_MS = 5 * 60 * 1000;
const DEFAULT_COMMAND_DELAY_MIN_MS = 12_000;
const DEFAULT_COMMAND_DELAY_MAX_MS = 45_000;

const METRIC_COMMANDS = Object.freeze([
  { metric: 'playtime', missingColumn: 'missing_playtime', command: '!pt' },
  { metric: 'joinDate', missingColumn: 'missing_join_date', command: '!jd' },
  { metric: 'lastSeen', missingColumn: 'missing_last_seen', command: '!seen' },
  { metric: 'messages', missingColumn: 'missing_messages', command: '!msgs' }
]);

function positiveMilliseconds(value, fallback, { minimum = 1 } = {}) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum ? Math.floor(parsed) : fallback;
}

function randomMilliseconds(minimum, maximum, random = Math.random) {
  const safeMinimum = Math.max(0, Math.floor(Number(minimum) || 0));
  const safeMaximum = Math.max(safeMinimum, Math.floor(Number(maximum) || safeMinimum));
  const sample = Math.max(0, Math.min(0.9999999999999999, Number(random()) || 0));
  return safeMinimum + Math.floor(sample * (safeMaximum - safeMinimum + 1));
}

function shuffleItems(items, random = Math.random) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const swapIndex = randomMilliseconds(0, index, random);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function listReadyCommandSenders(contexts = []) {
  const seenBots = new Set();
  return contexts.filter(context => {
    const bot = context?.bot;
    if (!bot?.entity || typeof bot.chat !== 'function' || seenBots.has(bot)) return false;
    seenBots.add(bot);
    return true;
  });
}

function pickRandomCommandSender(contexts = [], random = Math.random) {
  const ready = listReadyCommandSenders(contexts);
  if (ready.length === 0) return null;
  return ready[randomMilliseconds(0, ready.length - 1, random)];
}

function normalizeUsername(value) {
  const username = String(value || '').trim();
  return /^[A-Za-z0-9_]{1,32}$/.test(username) ? username : '';
}

function buildMissingCommands(rows = []) {
  const commands = [];
  const seen = new Set();

  for (const row of rows) {
    const username = normalizeUsername(row?.username);
    if (!username) continue;
    for (const definition of METRIC_COMMANDS) {
      if (!row[definition.missingColumn]) continue;
      const key = `${definition.metric}:${username.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      commands.push({
        metric: definition.metric,
        username,
        command: `${definition.command} ${username}`
      });
    }
  }
  return commands;
}

async function loadMissingPlayerInfo(pool) {
  if (!pool) return [];
  const result = await pool.query(`
    WITH candidate_players AS (
      SELECT activity.username,
             activity.player_uuid,
             activity.registration_at,
             activity.last_seen,
             activity.observed_message_count
      FROM player_activity activity

      UNION ALL

      SELECT whitelist_player.username,
             NULL::uuid AS player_uuid,
             NULL::timestamptz AS registration_at,
             NULL::timestamptz AS last_seen,
             NULL::bigint AS observed_message_count
      FROM whitelist whitelist_player
      WHERE NOT EXISTS (
        SELECT 1 FROM player_activity activity
        WHERE LOWER(activity.username) = LOWER(whitelist_player.username)
      )

      UNION ALL

      SELECT playtime.username,
             playtime.player_uuid,
             NULL::timestamptz AS registration_at,
             NULL::timestamptz AS last_seen,
             NULL::bigint AS observed_message_count
      FROM player_playtime playtime
      WHERE NOT EXISTS (
        SELECT 1 FROM player_activity activity
        WHERE (playtime.player_uuid IS NOT NULL AND activity.player_uuid = playtime.player_uuid)
           OR LOWER(activity.username) = LOWER(playtime.username)
      )
        AND NOT EXISTS (
          SELECT 1 FROM whitelist whitelist_player
          WHERE LOWER(whitelist_player.username) = LOWER(playtime.username)
        )
    ), missing AS (
      SELECT candidate.username,
             NOT EXISTS (
               SELECT 1 FROM player_playtime playtime
               WHERE (candidate.player_uuid IS NOT NULL AND playtime.player_uuid = candidate.player_uuid)
                  OR LOWER(playtime.username) = LOWER(candidate.username)
             ) AS missing_playtime,
             candidate.observed_message_count IS NULL AS missing_messages,
             (
               candidate.registration_at IS NULL
               OR candidate.registration_at = candidate.last_seen
             ) AS missing_join_date,
             candidate.last_seen IS NULL AS missing_last_seen,
             NOT EXISTS (
               SELECT 1 FROM player_info_lookup_exclusions exclusion
               WHERE exclusion.username_key = LOWER(candidate.username)
             ) AS lookup_available
      FROM candidate_players candidate
    )
    SELECT username, missing_playtime, missing_messages, missing_join_date, missing_last_seen
    FROM missing
    WHERE lookup_available
      AND (missing_playtime OR missing_messages OR missing_join_date OR missing_last_seen)
    ORDER BY (
      missing_playtime::int + missing_join_date::int + missing_last_seen::int
    ) DESC,
    RANDOM()
    LIMIT 1
  `);
  return result.rows;
}

function createPlayerInfoBackfill({
  pool,
  isReady = () => false,
  selectSender = () => null,
  prepareLookup = async () => true,
  sendCommand = () => false,
  intervalMs,
  minIntervalMs,
  maxIntervalMs,
  initialDelayMs,
  initialDelayMinMs,
  initialDelayMaxMs,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  commandDelayMs,
  commandDelayMinMs,
  commandDelayMaxMs,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  now = () => Date.now(),
  random = Math.random,
  loadNextRunAt = async () => null,
  saveNextRunAt = async () => {},
  sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
  onLog = message => console.log(message),
  onError = error => console.error('[PlayerInfo] Automatic missing-data check failed:', error?.message || error)
} = {}) {
  const fixedIntervalMs = positiveMilliseconds(intervalMs, 0, { minimum: 0 });
  const safeMinIntervalMs = positiveMilliseconds(
    minIntervalMs,
    fixedIntervalMs || DEFAULT_MIN_INTERVAL_MS
  );
  const safeMaxIntervalMs = Math.max(safeMinIntervalMs, positiveMilliseconds(
    maxIntervalMs,
    fixedIntervalMs || DEFAULT_MAX_INTERVAL_MS
  ));
  const fixedInitialDelayMs = positiveMilliseconds(initialDelayMs, -1, { minimum: 0 });
  const safeInitialDelayMinMs = positiveMilliseconds(
    initialDelayMinMs,
    fixedInitialDelayMs >= 0 ? fixedInitialDelayMs : DEFAULT_INITIAL_DELAY_MIN_MS,
    { minimum: 0 }
  );
  const safeInitialDelayMaxMs = Math.max(safeInitialDelayMinMs, positiveMilliseconds(
    initialDelayMaxMs,
    fixedInitialDelayMs >= 0 ? fixedInitialDelayMs : DEFAULT_INITIAL_DELAY_MAX_MS,
    { minimum: 0 }
  ));
  const safeRetryDelayMs = positiveMilliseconds(retryDelayMs, DEFAULT_RETRY_DELAY_MS);
  const fixedCommandDelayMs = positiveMilliseconds(commandDelayMs, -1, { minimum: 0 });
  const safeCommandDelayMinMs = positiveMilliseconds(
    commandDelayMinMs,
    fixedCommandDelayMs >= 0 ? fixedCommandDelayMs : DEFAULT_COMMAND_DELAY_MIN_MS,
    { minimum: 0 }
  );
  const safeCommandDelayMaxMs = Math.max(safeCommandDelayMinMs, positiveMilliseconds(
    commandDelayMaxMs,
    fixedCommandDelayMs >= 0 ? fixedCommandDelayMs : DEFAULT_COMMAND_DELAY_MAX_MS,
    { minimum: 0 }
  ));
  let timer = null;
  let running = false;
  let enabled = false;
  let lastRunAt = 0;
  let nextRunAt = 0;
  let scheduleHydrated = false;
  let startPromise = null;

  function cancelScheduledRun() {
    if (timer != null) clearTimer(timer);
    timer = null;
  }

  async function persistNextRunAt(timestamp) {
    try {
      await saveNextRunAt(timestamp);
      return true;
    } catch (error) {
      onError(new Error(`could not persist next run time: ${error?.message || error}`));
      return false;
    }
  }

  async function scheduleAt(timestamp, { persist = true } = {}) {
    cancelScheduledRun();
    nextRunAt = Math.max(0, Math.floor(Number(timestamp) || 0));
    if (persist) await persistNextRunAt(nextRunAt);
    const delayMs = Math.max(0, nextRunAt - now());
    timer = setTimer(async () => {
      timer = null;
      let plannedNextRunAt = now() + randomMilliseconds(safeMinIntervalMs, safeMaxIntervalMs, random);
      // Reserve the next randomized slot before issuing chat commands. If the
      // process is redeployed mid-batch, startup resumes this future slot
      // instead of generating a fresh delay and repeating the same batch.
      nextRunAt = plannedNextRunAt;
      await persistNextRunAt(plannedNextRunAt);
      try {
        const result = await run();
        if (result.skipped) plannedNextRunAt = now() + safeRetryDelayMs;
      } catch (error) {
        onError(error);
        plannedNextRunAt = now() + safeRetryDelayMs;
      }
      if (plannedNextRunAt !== nextRunAt) {
        nextRunAt = plannedNextRunAt;
        await persistNextRunAt(plannedNextRunAt);
      }
      if (enabled && timer == null) await scheduleAt(plannedNextRunAt, { persist: false });
    }, delayMs);
    timer?.unref?.();
  }

  async function run() {
    if (running) return { skipped: true, reason: 'already-running', sent: 0 };
    if (!pool) return { skipped: true, reason: 'database-unavailable', sent: 0 };
    if (!isReady()) return { skipped: true, reason: 'minecraft-unavailable', sent: 0 };

    running = true;
    let sent = 0;
    try {
      const rows = await loadMissingPlayerInfo(pool);
      lastRunAt = now();
      const commands = buildMissingCommands(rows);
      if (commands.length === 0) {
        onLog('[PlayerInfo] Automatic check found no missing PT, JD, Seen, or Messages values.');
        return { skipped: false, sent, total: 0 };
      }

      onLog(`[PlayerInfo] Automatic check queued ${commands.length} missing value(s) for ${rows.length} player(s).`);
      const sender = await selectSender(commands, rows);
      for (let index = 0; index < commands.length; index++) {
        if (!isReady()) break;
        const item = commands[index];
        try {
          const prepared = await prepareLookup(item);
          if (prepared === false) throw new Error('response observation could not be prepared');
          if (!sendCommand(item.command, item, sender)) break;
          sent += 1;
        } catch (error) {
          onError(new Error(`${item.command}: ${error?.message || error}`));
        }
        if (index < commands.length - 1 && safeCommandDelayMaxMs > 0) {
          await sleep(randomMilliseconds(safeCommandDelayMinMs, safeCommandDelayMaxMs, random));
        }
      }
      onLog(`[PlayerInfo] Automatic check sent ${sent}/${commands.length} command(s).`);
      return { skipped: false, sent, total: commands.length };
    } finally {
      running = false;
    }
  }

  async function start() {
    enabled = true;
    if (timer != null || running) return false;
    if (startPromise) return startPromise;
    startPromise = (async () => {
      if (!scheduleHydrated) {
        try {
          const storedNextRunAt = Number(await loadNextRunAt());
          if (Number.isFinite(storedNextRunAt) && storedNextRunAt > 0) {
            nextRunAt = Math.floor(storedNextRunAt);
          }
        } catch (error) {
          onError(new Error(`could not restore next run time: ${error?.message || error}`));
        }
        scheduleHydrated = true;
      }
      if (!enabled) return false;
      const hasStoredSchedule = nextRunAt > 0;
      const scheduledAt = hasStoredSchedule
        ? nextRunAt
        : now() + randomMilliseconds(safeInitialDelayMinMs, safeInitialDelayMaxMs, random);
      await scheduleAt(scheduledAt, { persist: !hasStoredSchedule });
      return true;
    })().finally(() => {
      startPromise = null;
    });
    return startPromise;
  }

  function stop() {
    enabled = false;
    cancelScheduledRun();
  }

  return {
    run,
    start,
    stop,
    getStatus: () => ({ enabled, running, scheduled: timer != null, lastRunAt, nextRunAt, scheduleHydrated })
  };
}

module.exports = {
  DEFAULT_COMMAND_DELAY_MAX_MS,
  DEFAULT_COMMAND_DELAY_MIN_MS,
  DEFAULT_INITIAL_DELAY_MAX_MS,
  DEFAULT_INITIAL_DELAY_MIN_MS,
  DEFAULT_MAX_INTERVAL_MS,
  DEFAULT_MIN_INTERVAL_MS,
  DEFAULT_RETRY_DELAY_MS,
  buildMissingCommands,
  createPlayerInfoBackfill,
  listReadyCommandSenders,
  loadMissingPlayerInfo,
  normalizeUsername,
  pickRandomCommandSender,
  randomMilliseconds,
  shuffleItems
};
