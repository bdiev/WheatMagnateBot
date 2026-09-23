'use strict';

const PING_SAMPLE_INTERVAL_MS = 60_000;
const PING_RETENTION_DAYS = 180;
const PING_RETENTION_CHECK_MS = 6 * 60 * 60 * 1000;
// Tab-list latency is 0 until the server reports it and some servers send
// sentinel values for hidden players, so only plausible readings are kept.
const MIN_VALID_PING_MS = 1;
const MAX_VALID_PING_MS = 10_000;
const MINECRAFT_USERNAME_PATTERN = /^[A-Za-z0-9_]{1,32}$/;
const MINECRAFT_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizePingSamples(players = [], { excludeUsername = null } = {}) {
  const excludedKey = String(excludeUsername || '').toLowerCase();
  const samplesByKey = new Map();
  for (const player of Array.isArray(players) ? players : []) {
    const username = String(player?.username || '').trim();
    if (!MINECRAFT_USERNAME_PATTERN.test(username)) continue;
    const key = username.toLowerCase();
    if (key === excludedKey || samplesByKey.has(key)) continue;
    const ping = Number(player?.ping);
    if (!Number.isInteger(ping) || ping < MIN_VALID_PING_MS || ping > MAX_VALID_PING_MS) continue;
    const uuid = MINECRAFT_UUID_PATTERN.test(String(player?.uuid || '')) ? String(player.uuid).toLowerCase() : null;
    samplesByKey.set(key, { username, key, uuid, ping });
  }
  return [...samplesByKey.values()];
}

function createPlayerPingFeature({
  pool,
  getPlayers,
  getBotUsername = () => null,
  now = () => new Date(),
  intervalMs = PING_SAMPLE_INTERVAL_MS
}) {
  let timer = null;
  let running = false;
  let lastRetentionAt = 0;

  async function pruneOldSamples(sampledAt) {
    if (sampledAt.getTime() - lastRetentionAt < PING_RETENTION_CHECK_MS) return;
    lastRetentionAt = sampledAt.getTime();
    await pool.query(
      `DELETE FROM player_ping_hourly WHERE hour_start < $1::timestamptz - make_interval(days => $2::int)`,
      [sampledAt.toISOString(), PING_RETENTION_DAYS]
    );
  }

  async function sample() {
    if (!pool || running) return { skipped: true };
    const samples = normalizePingSamples(getPlayers(), { excludeUsername: getBotUsername() });
    if (!samples.length) return { recorded: 0 };
    running = true;
    const sampledAt = now();
    try {
      const params = [
        samples.map(sample => sample.key),
        samples.map(sample => sample.ping),
        samples.map(sample => sample.uuid),
        sampledAt.toISOString()
      ];
      await pool.query(`
        INSERT INTO player_ping_hourly (username_key, hour_start, player_uuid, sample_count, ping_sum, ping_min, ping_max)
        SELECT s.username_key, date_trunc('hour', $4::timestamptz), s.player_uuid, 1, s.ping, s.ping, s.ping
        FROM UNNEST($1::text[], $2::int[], $3::uuid[]) AS s(username_key, ping, player_uuid)
        ON CONFLICT (username_key, hour_start) DO UPDATE
        SET sample_count = player_ping_hourly.sample_count + 1,
            ping_sum = player_ping_hourly.ping_sum + EXCLUDED.ping_sum,
            ping_min = LEAST(player_ping_hourly.ping_min, EXCLUDED.ping_min),
            ping_max = GREATEST(player_ping_hourly.ping_max, EXCLUDED.ping_max),
            player_uuid = COALESCE(EXCLUDED.player_uuid, player_ping_hourly.player_uuid)
      `, params);
      await pool.query(`
        UPDATE player_activity pa
        SET last_ping_ms = s.ping,
            last_ping_at = $3::timestamptz
        FROM UNNEST($1::text[], $2::int[]) AS s(username_key, ping)
        WHERE LOWER(pa.username) = s.username_key
      `, [params[0], params[1], params[3]]);
      await pruneOldSamples(sampledAt);
      return { recorded: samples.length };
    } finally {
      running = false;
    }
  }

  function start() {
    stop();
    timer = setInterval(() => {
      sample().catch(err => console.error('[PlayerPing] Sample failed:', err.message));
    }, intervalMs);
    timer.unref?.();
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { sample, start, stop };
}

module.exports = {
  MAX_VALID_PING_MS,
  PING_SAMPLE_INTERVAL_MS,
  createPlayerPingFeature,
  normalizePingSamples
};
