'use strict';

const DEFAULT_INTERVAL_MS = 8 * 60 * 60 * 1000;
const DEFAULT_INITIAL_DELAY_MS = 30_000;
const DEFAULT_RETRY_DELAY_MS = 5 * 60 * 1000;
const DEFAULT_COMMAND_DELAY_MS = 3_000;

const METRIC_COMMANDS = Object.freeze([
  { metric: 'playtime', missingColumn: 'missing_playtime', command: '!pt' },
  { metric: 'joinDate', missingColumn: 'missing_join_date', command: '!jd' },
  { metric: 'lastSeen', missingColumn: 'missing_last_seen', command: '!seen' }
]);

function positiveMilliseconds(value, fallback, { minimum = 1 } = {}) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum ? Math.floor(parsed) : fallback;
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
             activity.last_seen
      FROM player_activity activity

      UNION ALL

      SELECT whitelist_player.username,
             NULL::uuid AS player_uuid,
             NULL::timestamptz AS registration_at,
             NULL::timestamptz AS last_seen
      FROM whitelist whitelist_player
      WHERE NOT EXISTS (
        SELECT 1 FROM player_activity activity
        WHERE LOWER(activity.username) = LOWER(whitelist_player.username)
      )

      UNION ALL

      SELECT playtime.username,
             playtime.player_uuid,
             NULL::timestamptz AS registration_at,
             NULL::timestamptz AS last_seen
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
             candidate.registration_at IS NULL AS missing_join_date,
             candidate.last_seen IS NULL AS missing_last_seen
      FROM candidate_players candidate
    )
    SELECT username, missing_playtime, missing_join_date, missing_last_seen
    FROM missing
    WHERE missing_playtime OR missing_join_date OR missing_last_seen
    ORDER BY RANDOM()
    LIMIT 1
  `);
  return result.rows;
}

function createPlayerInfoBackfill({
  pool,
  isReady = () => false,
  prepareLookup = async () => true,
  sendCommand = () => false,
  intervalMs = DEFAULT_INTERVAL_MS,
  initialDelayMs = DEFAULT_INITIAL_DELAY_MS,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  commandDelayMs = DEFAULT_COMMAND_DELAY_MS,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  now = () => Date.now(),
  sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
  onLog = message => console.log(message),
  onError = error => console.error('[PlayerInfo] Automatic missing-data check failed:', error?.message || error)
} = {}) {
  const safeIntervalMs = positiveMilliseconds(intervalMs, DEFAULT_INTERVAL_MS);
  const safeInitialDelayMs = positiveMilliseconds(initialDelayMs, DEFAULT_INITIAL_DELAY_MS, { minimum: 0 });
  const safeRetryDelayMs = positiveMilliseconds(retryDelayMs, DEFAULT_RETRY_DELAY_MS);
  const safeCommandDelayMs = positiveMilliseconds(commandDelayMs, DEFAULT_COMMAND_DELAY_MS, { minimum: 0 });
  let timer = null;
  let running = false;
  let enabled = false;
  let lastRunAt = 0;

  function cancelScheduledRun() {
    if (timer != null) clearTimer(timer);
    timer = null;
  }

  function schedule(delayMs) {
    cancelScheduledRun();
    timer = setTimer(async () => {
      timer = null;
      let nextDelay = safeIntervalMs;
      try {
        const result = await run();
        if (result.skipped) nextDelay = safeRetryDelayMs;
      } catch (error) {
        onError(error);
        nextDelay = safeRetryDelayMs;
      }
      if (enabled && timer == null) schedule(nextDelay);
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
        onLog('[PlayerInfo] Automatic check found no missing PT, JD, or Seen values.');
        return { skipped: false, sent, total: 0 };
      }

      onLog(`[PlayerInfo] Automatic check queued ${commands.length} missing value(s) for ${rows.length} player(s).`);
      for (let index = 0; index < commands.length; index++) {
        if (!isReady()) break;
        const item = commands[index];
        try {
          const prepared = await prepareLookup(item);
          if (prepared === false) throw new Error('response observation could not be prepared');
          if (!sendCommand(item.command)) break;
          sent += 1;
        } catch (error) {
          onError(new Error(`${item.command}: ${error?.message || error}`));
        }
        if (index < commands.length - 1 && safeCommandDelayMs > 0) {
          await sleep(safeCommandDelayMs);
        }
      }
      onLog(`[PlayerInfo] Automatic check sent ${sent}/${commands.length} command(s).`);
      return { skipped: false, sent, total: commands.length };
    } finally {
      running = false;
    }
  }

  function start() {
    enabled = true;
    if (timer != null || running) return false;
    const elapsed = lastRunAt ? Math.max(0, now() - lastRunAt) : 0;
    const delay = lastRunAt
      ? Math.max(safeInitialDelayMs, safeIntervalMs - elapsed)
      : safeInitialDelayMs;
    schedule(delay);
    return true;
  }

  function stop() {
    enabled = false;
    cancelScheduledRun();
  }

  return {
    run,
    start,
    stop,
    getStatus: () => ({ enabled, running, scheduled: timer != null, lastRunAt })
  };
}

module.exports = {
  DEFAULT_COMMAND_DELAY_MS,
  DEFAULT_INITIAL_DELAY_MS,
  DEFAULT_INTERVAL_MS,
  DEFAULT_RETRY_DELAY_MS,
  buildMissingCommands,
  createPlayerInfoBackfill,
  loadMissingPlayerInfo,
  normalizeUsername
};
