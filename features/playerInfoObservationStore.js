'use strict';

const METRICS = new Set(['playtime', 'messages', 'joinDate']);
const DEFAULT_REFRESH_TTL_MS = 2 * 60 * 1000;

function normalizeMetric(value) {
  return METRICS.has(value) ? value : '';
}

function normalizeUsername(value) {
  const username = String(value || '').trim();
  return /^[A-Za-z0-9_]{1,32}$/.test(username) ? username : '';
}

function nameIdentityKey(username) {
  return `name:${String(username || '').toLowerCase()}`;
}

function uuidIdentityKey(uuid) {
  return `uuid:${String(uuid || '').toLowerCase()}`;
}

function latestDate(rows, field) {
  return rows
    .map(row => row[field] ? new Date(row[field]) : null)
    .filter(date => date && Number.isFinite(date.getTime()))
    .sort((first, second) => second - first)[0] || null;
}

function createPlayerInfoObservationStore({ pool, now = () => new Date(), refreshTtlMs = DEFAULT_REFRESH_TTL_MS } = {}) {
  let operationQueue = Promise.resolve();

  function enqueue(task) {
    const run = operationQueue.then(task, task);
    operationQueue = run.catch(() => {});
    return run;
  }

  async function resolveIdentity(client, targetUsername) {
    const username = normalizeUsername(targetUsername);
    if (!username) throw new Error('A valid Minecraft username is required.');

    const result = await client.query(`
      SELECT pa.username, pa.player_uuid
      FROM player_activity pa
      WHERE LOWER(pa.username) = LOWER($1)
         OR (
           pa.player_uuid IS NOT NULL
           AND EXISTS (
             SELECT 1 FROM player_name_history history
             WHERE history.player_uuid = pa.player_uuid
               AND LOWER(history.username) = LOWER($1)
           )
         )
      ORDER BY (LOWER(pa.username) = LOWER($1)) DESC,
               pa.is_online DESC,
               COALESCE(pa.last_seen, pa.last_online, pa.registration_at) DESC NULLS LAST,
               pa.id DESC
      LIMIT 1
    `, [username]);
    const row = result.rows[0];
    const canonicalUsername = normalizeUsername(row?.username) || username;
    const playerUuid = row?.player_uuid ? String(row.player_uuid).toLowerCase() : null;
    const aliases = new Set([username.toLowerCase(), canonicalUsername.toLowerCase()]);

    if (playerUuid) {
      const history = await client.query(`
        SELECT username FROM player_name_history WHERE player_uuid = $1::uuid
      `, [playerUuid]);
      history.rows.forEach(alias => {
        const cleanAlias = normalizeUsername(alias.username);
        if (cleanAlias) aliases.add(cleanAlias.toLowerCase());
      });
    }

    const identityKey = playerUuid ? uuidIdentityKey(playerUuid) : nameIdentityKey(canonicalUsername);
    const keys = [...new Set([
      identityKey,
      ...[...aliases].map(nameIdentityKey)
    ])];
    return { username: canonicalUsername, playerUuid, identityKey, keys };
  }

  async function readLockedState(client, metric, identity) {
    return (await client.query(`
      SELECT identity_key, imported, refresh_requested_at
      FROM player_info_observation_state
      WHERE metric = $1 AND identity_key = ANY($2::text[])
      FOR UPDATE
    `, [metric, identity.keys])).rows;
  }

  async function writeCanonicalState(client, metric, identity, { imported, refreshRequestedAt }) {
    await client.query(`
      DELETE FROM player_info_observation_state
      WHERE metric = $1
        AND identity_key = ANY($2::text[])
        AND identity_key <> $3
    `, [metric, identity.keys, identity.identityKey]);
    await client.query(`
      INSERT INTO player_info_observation_state
        (metric, identity_key, username, imported, refresh_requested_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (metric, identity_key)
      DO UPDATE SET username = EXCLUDED.username,
                    imported = EXCLUDED.imported,
                    refresh_requested_at = EXCLUDED.refresh_requested_at,
                    updated_at = NOW()
    `, [metric, identity.identityKey, identity.username, Boolean(imported), refreshRequestedAt || null]);
  }

  async function inTransaction(task) {
    if (!pool) return { allowed: false, reason: 'database-unavailable' };
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await task(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  function requestRefresh(metricValue, targetUsername) {
    return enqueue(() => inTransaction(async client => {
      const metric = normalizeMetric(metricValue);
      if (!metric) throw new Error('Unsupported player information metric.');
      const identity = await resolveIdentity(client, targetUsername);
      const rows = await readLockedState(client, metric, identity);
      await writeCanonicalState(client, metric, identity, {
        imported: rows.some(row => row.imported),
        refreshRequestedAt: new Date(now())
      });
      return { requested: true, metric, username: identity.username };
    }));
  }

  function withPermission(metricValue, targetUsername, handler) {
    return enqueue(() => inTransaction(async client => {
      const metric = normalizeMetric(metricValue);
      if (!metric) throw new Error('Unsupported player information metric.');
      const identity = await resolveIdentity(client, targetUsername);
      const rows = await readLockedState(client, metric, identity);
      const imported = rows.some(row => row.imported);
      const refreshRequestedAt = latestDate(rows, 'refresh_requested_at');
      const nowDate = new Date(now());
      const hasFreshRefresh = Boolean(
        refreshRequestedAt
        && nowDate.getTime() - refreshRequestedAt.getTime() <= refreshTtlMs
      );

      if (imported && !hasFreshRefresh) {
        if (refreshRequestedAt) {
          await writeCanonicalState(client, metric, identity, { imported: true, refreshRequestedAt: null });
        }
        return { allowed: false, reason: 'already-imported', metric, username: identity.username };
      }

      const value = await handler(client, identity);
      await writeCanonicalState(client, metric, identity, { imported: true, refreshRequestedAt: null });
      return {
        allowed: true,
        reason: hasFreshRefresh ? 'site-refresh' : 'initial-import',
        metric,
        username: identity.username,
        value
      };
    }));
  }

  return { requestRefresh, withPermission };
}

module.exports = {
  DEFAULT_REFRESH_TTL_MS,
  createPlayerInfoObservationStore,
  nameIdentityKey,
  normalizeMetric,
  normalizeUsername,
  uuidIdentityKey
};
