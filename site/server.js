'use strict';

const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { Pool } = require('pg');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const PORT = Number(process.env.SITE_PORT || process.env.PORT) || 3080;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATABASE_URL = process.env.DATABASE_URL;
const SITE_ADMIN_USERNAME = 'bdiev_';
const SITE_ADMIN_PASSWORD = process.env.SITE_ADMIN_PASSWORD || '';
const SESSION_COOKIE = 'wm_session';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const pool = DATABASE_URL
  ? new Pool({ connectionString: DATABASE_URL })
  : null;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function sendError(res, statusCode, message) {
  sendJson(res, statusCode, { error: message });
}

function parseCookies(req) {
  return String(req.headers.cookie || '')
    .split(';')
    .map(part => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const index = part.indexOf('=');
      if (index === -1) return cookies;
      cookies[decodeURIComponent(part.slice(0, index))] = decodeURIComponent(part.slice(index + 1));
      return cookies;
    }, {});
}

function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}`);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  const [method, salt, hash] = String(storedHash || '').split(':');
  if (method !== 'scrypt' || !salt || !hash) return false;
  const actual = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(Object.assign(new Error('Request body is too large.'), { statusCode: 413 }));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(Object.assign(new Error('Invalid JSON body.'), { statusCode: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function assertDatabase() {
  if (!pool) {
    const err = new Error('DATABASE_URL is not configured on the server.');
    err.statusCode = 503;
    throw err;
  }
}

function toInt(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatSeconds(seconds) {
  let left = Math.max(0, Math.floor(Number(seconds) || 0));
  const days = Math.floor(left / 86400);
  left %= 86400;
  const hours = Math.floor(left / 3600);
  left %= 3600;
  const minutes = Math.floor(left / 60);
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours || days) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  return parts.join(' ');
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function compactFarmState(row = {}) {
  const sessionStartedAt = row.session_started_at || null;
  const sessionSeconds = sessionStartedAt
    ? Math.max(0, Math.floor((Date.now() - new Date(sessionStartedAt).getTime()) / 1000))
    : 0;
  const sessionMined = toInt(row.session_mined);
  const retiredPickaxes = toInt(row.retired_pickaxes);
  const retiredPickaxeBlocks = toInt(row.retired_pickaxe_blocks);

  return {
    sessionMined,
    totalMined: toInt(row.total_mined),
    desiredEnabled: Boolean(row.desired_enabled),
    sessionStartedAt,
    sessionSeconds,
    sessionDuration: formatSeconds(sessionSeconds),
    sessionPerMinute: sessionSeconds > 0 ? Number(((sessionMined / sessionSeconds) * 60).toFixed(1)) : 0,
    sessionPerHour: sessionSeconds > 0 ? Math.round((sessionMined / sessionSeconds) * 3600) : 0,
    retiredPickaxes,
    retiredPickaxeBlocks,
    blocksPerPickaxe: retiredPickaxes > 0 ? Math.round(retiredPickaxeBlocks / retiredPickaxes) : null,
    target: {
      x: row.target_x == null ? null : toInt(row.target_x),
      y: row.target_y == null ? null : toInt(row.target_y),
      z: row.target_z == null ? null : toInt(row.target_z),
      radius: row.target_radius == null ? null : toInt(row.target_radius)
    },
    updatedAt: row.updated_at || null
  };
}

function normalizeItemName(name) {
  return String(name || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

function summarizeSupplyLocation(location) {
  const items = Array.isArray(location?.allItems) ? location.allItems : [];
  const foodCount = toInt(location?.foodCount);
  const pickaxes = Array.isArray(location?.pickaxes) ? location.pickaxes : [];
  const usablePickaxeCount = toInt(location?.usablePickaxeCount);
  const totalItems = items.reduce((sum, item) => sum + toInt(item.count), 0);

  return {
    foodCount,
    pickaxeCount: pickaxes.length,
    usablePickaxeCount,
    totalItems,
    items: items
      .map(item => ({
        name: item.name,
        label: normalizeItemName(item.name),
        count: toInt(item.count),
        remainingPercent: item.remainingPercent == null ? null : toNumber(item.remainingPercent),
        usable: item.usable
      }))
      .sort((a, b) => a.label.localeCompare(b.label))
  };
}

function normalizeSupplySnapshot(row) {
  const supplies = row?.supplies || null;
  if (!supplies) {
    return {
      hasSnapshot: false,
      observedAt: null,
      updatedAt: null,
      inventory: null,
      barrel: null,
      barrelError: 'No supply snapshot has been recorded yet.'
    };
  }

  return {
    hasSnapshot: true,
    observedAt: supplies.observedAt || row.observed_at || null,
    updatedAt: row.updated_at || null,
    inventory: summarizeSupplyLocation(supplies.inventory),
    barrel: supplies.barrel ? summarizeSupplyLocation(supplies.barrel) : null,
    barrelError: supplies.barrelError || null
  };
}

async function ensureOptionalTables() {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS site_users (
      id BIGSERIAL PRIMARY KEY,
      username VARCHAR(64) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role VARCHAR(20) NOT NULL DEFAULT 'user',
      status VARCHAR(20) NOT NULL DEFAULT 'approved',
      approved_by BIGINT REFERENCES site_users(id) ON DELETE SET NULL,
      approved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE site_users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user'`);
  await pool.query(`ALTER TABLE site_users ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'approved'`);
  await pool.query(`ALTER TABLE site_users ADD COLUMN IF NOT EXISTS approved_by BIGINT REFERENCES site_users(id) ON DELETE SET NULL`);
  await pool.query(`ALTER TABLE site_users ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ`);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS site_users_username_lower_idx
    ON site_users (LOWER(username))
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS site_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES site_users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS site_sessions_user_id_idx ON site_sessions (user_id)`);
  await pool.query(`DELETE FROM site_sessions WHERE expires_at <= NOW()`);
  await pool.query(
    `UPDATE site_users
     SET role = 'admin',
         status = 'approved',
         approved_at = COALESCE(approved_at, NOW())
     WHERE LOWER(username) = LOWER($1)`,
    [SITE_ADMIN_USERNAME]
  );
  if (SITE_ADMIN_PASSWORD) {
    const adminPasswordHash = hashPassword(SITE_ADMIN_PASSWORD);
    const updatedAdmin = await pool.query(
      `UPDATE site_users
       SET username = $1,
           password_hash = $2,
           role = 'admin',
           status = 'approved',
           approved_at = COALESCE(approved_at, NOW())
       WHERE LOWER(username) = LOWER($1)`,
      [SITE_ADMIN_USERNAME, adminPasswordHash]
    );
    if (!updatedAdmin.rowCount) {
      await pool.query(
        `INSERT INTO site_users (username, password_hash, role, status, approved_at)
         VALUES ($1, $2, 'admin', 'approved', NOW())`,
        [SITE_ADMIN_USERNAME, adminPasswordHash]
      );
    }
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS game_chat_messages (
      id BIGSERIAL PRIMARY KEY,
      username VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS game_chat_messages_created_at_idx
    ON game_chat_messages (created_at DESC)
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS site_game_chat_outbox (
      id BIGSERIAL PRIMARY KEY,
      sender_username VARCHAR(64) NOT NULL,
      message TEXT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      sent_at TIMESTAMPTZ
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS site_game_chat_outbox_status_created_idx
    ON site_game_chat_outbox (status, created_at)
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS obsidian_farm_supply_snapshot (
      id SMALLINT PRIMARY KEY CHECK (id = 1),
      supplies JSONB NOT NULL,
      observed_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS obsidian_farm_hourly (
      bucket TIMESTAMPTZ PRIMARY KEY,
      mined BIGINT NOT NULL DEFAULT 0 CHECK (mined >= 0),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getSummary() {
  assertDatabase();

  const [
    players,
    farm,
    todayObsidian,
    latestTps,
    avgTps,
    nearby,
    chat
  ] = await Promise.all([
    pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE pt.tracking_since IS NOT NULL)::int AS online
      FROM whitelist w
      LEFT JOIN player_activity pa ON LOWER(pa.username) = LOWER(w.username)
      LEFT JOIN player_playtime pt ON LOWER(pt.username) = LOWER(w.username)
    `),
    pool.query(`
      SELECT session_mined, total_mined, desired_enabled, session_started_at,
             retired_pickaxes, retired_pickaxe_blocks, updated_at
      FROM obsidian_farm_state
      WHERE id = 1
    `),
    pool.query(`
      SELECT COALESCE(mined, 0)::bigint AS mined
      FROM obsidian_farm_daily
      WHERE farm_date = (NOW() AT TIME ZONE 'Europe/Kyiv')::date
    `),
    pool.query(`
      SELECT tps, sampled_at
      FROM bot_tps_samples
      ORDER BY sampled_at DESC
      LIMIT 1
    `),
    pool.query(`
      SELECT ROUND(AVG(tps)::numeric, 1) AS avg_tps
      FROM bot_tps_samples
      WHERE sampled_at >= NOW() - INTERVAL '24 hours'
    `),
    pool.query(`
      SELECT username, distance, last_seen
      FROM nearby_player_sightings
      ORDER BY last_seen DESC
      LIMIT 5
    `),
    pool.query(`
      SELECT COUNT(*)::int AS total
      FROM game_chat_messages
      WHERE created_at >= NOW() - INTERVAL '24 hours'
    `)
  ]);

  const farmRow = farm.rows[0] || {};
  const playerRow = players.rows[0] || {};

  return {
    generatedAt: new Date().toISOString(),
    players: {
      total: toInt(playerRow.total),
      online: toInt(playerRow.online)
    },
    obsidian: {
      sessionMined: toInt(farmRow.session_mined),
      totalMined: toInt(farmRow.total_mined),
      todayMined: toInt(todayObsidian.rows[0]?.mined),
      desiredEnabled: Boolean(farmRow.desired_enabled),
      sessionStartedAt: farmRow.session_started_at || null,
      retiredPickaxes: toInt(farmRow.retired_pickaxes),
      retiredPickaxeBlocks: toInt(farmRow.retired_pickaxe_blocks),
      updatedAt: farmRow.updated_at || null
    },
    tps: {
      latest: latestTps.rows[0]?.tps == null ? null : Number(latestTps.rows[0].tps),
      latestAt: latestTps.rows[0]?.sampled_at || null,
      average24h: avgTps.rows[0]?.avg_tps == null ? null : Number(avgTps.rows[0].avg_tps)
    },
    nearby: nearby.rows.map(row => ({
      username: row.username,
      distance: toInt(row.distance),
      lastSeen: row.last_seen
    })),
    chat: {
      messages24h: toInt(chat.rows[0]?.total)
    }
  };
}

async function getPlayers() {
  assertDatabase();

  const result = await pool.query(`
    SELECT
      w.username,
      pa.last_seen,
      pa.last_online,
      pt.tracking_since IS NOT NULL AS is_online,
      COALESCE(pt.total_seconds, 0) +
        CASE WHEN pt.tracking_since IS NULL THEN 0
             ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - pt.tracking_since)))::BIGINT)
        END AS total_seconds
    FROM whitelist w
    LEFT JOIN player_activity pa ON LOWER(pa.username) = LOWER(w.username)
    LEFT JOIN player_playtime pt ON LOWER(pt.username) = LOWER(w.username)
    ORDER BY
      (pt.tracking_since IS NOT NULL) DESC,
      total_seconds DESC,
      LOWER(w.username)
  `);

  return {
    players: result.rows.map(row => {
      const seconds = toInt(row.total_seconds);
      return {
        username: row.username,
        isOnline: Boolean(row.is_online),
        lastSeen: row.last_seen,
        lastOnline: row.last_online,
        totalSeconds: seconds,
        playtime: formatSeconds(seconds)
      };
    })
  };
}

async function getChat(url) {
  assertDatabase();

  const limit = Math.min(200, Math.max(1, toInt(url.searchParams.get('limit'), 100)));
  const [messagesResult, hourlyResult, topChattersResult, totalsResult] = await Promise.all([
    pool.query(`
      SELECT id, username, message, created_at
      FROM game_chat_messages
      ORDER BY created_at DESC
      LIMIT $1
    `, [limit]),
    pool.query(`
      WITH buckets AS (
        SELECT generate_series(
          date_trunc('hour', NOW() - INTERVAL '167 hours'),
          date_trunc('hour', NOW()),
          INTERVAL '1 hour'
        ) AS bucket
      )
      SELECT TO_CHAR(buckets.bucket, 'MM-DD HH24:00') AS label,
             buckets.bucket AS bucket,
             COALESCE(COUNT(messages.id), 0)::int AS count
      FROM buckets
      LEFT JOIN game_chat_messages messages
        ON date_trunc('hour', messages.created_at) = buckets.bucket
      GROUP BY buckets.bucket
      ORDER BY buckets.bucket
    `),
    pool.query(`
      SELECT username, COUNT(*)::int AS count
      FROM game_chat_messages
      WHERE created_at >= NOW() - INTERVAL '24 hours'
      GROUP BY username
      ORDER BY count DESC, LOWER(username)
      LIMIT 5
    `),
    pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')::int AS last_24h,
        COUNT(DISTINCT LOWER(username)) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')::int AS active_chatters_24h
      FROM game_chat_messages
    `)
  ]);

  return {
    messages: messagesResult.rows.reverse().map(row => ({
      id: row.id,
      username: row.username,
      message: row.message,
      createdAt: row.created_at
    })),
    hourly: hourlyResult.rows.map(row => ({
      label: row.label,
      bucket: row.bucket,
      value: toInt(row.count)
    })),
    topChatters: topChattersResult.rows.map(row => ({
      username: row.username,
      count: toInt(row.count)
    })),
    totals: {
      allTime: toInt(totalsResult.rows[0]?.total),
      last24h: toInt(totalsResult.rows[0]?.last_24h),
      activeChatters24h: toInt(totalsResult.rows[0]?.active_chatters_24h)
    }
  };
}

async function queueSiteChatMessage(currentUser, body) {
  assertDatabase();
  const message = String(body.message || '')
    .replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F]/g, '')
    .trim();

  if (!message) {
    const err = new Error('Message is required.');
    err.statusCode = 400;
    throw err;
  }
  if (message.length > 240) {
    const err = new Error('Message must be 240 characters or less.');
    err.statusCode = 400;
    throw err;
  }
  if (message.startsWith('/') || message.startsWith('!')) {
    const err = new Error('Commands cannot be sent from the site chat.');
    err.statusCode = 400;
    throw err;
  }

  const result = await pool.query(`
    INSERT INTO site_game_chat_outbox (sender_username, message)
    VALUES ($1, $2)
    RETURNING id, sender_username, message, status, created_at
  `, [currentUser.username, message]);

  return {
    queued: true,
    item: {
      id: String(result.rows[0].id),
      senderUsername: result.rows[0].sender_username,
      message: result.rows[0].message,
      status: result.rows[0].status,
      createdAt: result.rows[0].created_at
    }
  };
}

async function getBotStats() {
  assertDatabase();

  const [playersResult, leaderboardResult, recentActivityResult, activityTotalsResult] = await Promise.all([
    pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE pt.tracking_since IS NOT NULL)::int AS online,
        COUNT(*) FILTER (WHERE pt.tracking_since IS NULL)::int AS offline
      FROM whitelist w
      LEFT JOIN player_activity pa ON LOWER(pa.username) = LOWER(w.username)
      LEFT JOIN player_playtime pt ON LOWER(pt.username) = LOWER(w.username)
    `),
    pool.query(`
      SELECT
        w.username,
        pt.tracking_since IS NOT NULL AS is_online,
        pa.last_seen,
        COALESCE(pt.total_seconds, 0) +
          CASE WHEN pt.tracking_since IS NULL THEN 0
               ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - pt.tracking_since)))::BIGINT)
          END AS total_seconds
      FROM whitelist w
      LEFT JOIN player_activity pa ON LOWER(pa.username) = LOWER(w.username)
      LEFT JOIN player_playtime pt ON LOWER(pt.username) = LOWER(w.username)
      ORDER BY total_seconds DESC, LOWER(w.username)
      LIMIT 20
    `),
    pool.query(`
      SELECT pa.username,
             pa.last_seen,
             pa.last_online,
             pt.tracking_since IS NOT NULL AS is_online
      FROM player_activity pa
      LEFT JOIN player_playtime pt ON LOWER(pt.username) = LOWER(pa.username)
      ORDER BY pa.last_seen DESC NULLS LAST
      LIMIT 20
    `),
    pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE last_seen >= NOW() - INTERVAL '24 hours')::int AS seen_24h,
        COUNT(*) FILTER (WHERE last_seen >= NOW() - INTERVAL '7 days')::int AS seen_7d
      FROM player_activity
    `)
  ]);

  const totals = playersResult.rows[0] || {};
  const activityTotals = activityTotalsResult.rows[0] || {};

  return {
    players: {
      total: toInt(totals.total),
      online: toInt(totals.online),
      offline: toInt(totals.offline),
      seen24h: toInt(activityTotals.seen_24h),
      seen7d: toInt(activityTotals.seen_7d)
    },
    playtimeLeaderboard: leaderboardResult.rows.map(row => {
      const seconds = toInt(row.total_seconds);
      return {
        username: row.username,
        isOnline: Boolean(row.is_online),
        lastSeen: row.last_seen,
        totalSeconds: seconds,
        playtime: formatSeconds(seconds)
      };
    }),
    recentActivity: recentActivityResult.rows.map(row => ({
      username: row.username,
      isOnline: Boolean(row.is_online),
      lastSeen: row.last_seen,
      lastOnline: row.last_online
    }))
  };
}

async function getObsidianStats() {
  assertDatabase();

  const [farmResult, todayResult, dailyResult, hourlyResult, supplyResult] = await Promise.all([
    pool.query(`
      SELECT session_mined, total_mined, desired_enabled, session_started_at,
             retired_pickaxes, retired_pickaxe_blocks, target_x, target_y,
             target_z, target_radius, updated_at
      FROM obsidian_farm_state
      WHERE id = 1
    `),
    pool.query(`
      SELECT COALESCE(mined, 0)::bigint AS mined
      FROM obsidian_farm_daily
      WHERE farm_date = (NOW() AT TIME ZONE 'Europe/Kyiv')::date
    `),
    pool.query(`
      WITH dates AS (
        SELECT generate_series(
          (NOW() AT TIME ZONE 'Europe/Kyiv')::date - 89,
          (NOW() AT TIME ZONE 'Europe/Kyiv')::date,
          INTERVAL '1 day'
        )::date AS farm_date
      )
      SELECT TO_CHAR(dates.farm_date, 'MM-DD') AS label,
             dates.farm_date::text AS bucket,
             COALESCE(stats.mined, 0)::bigint AS mined
      FROM dates
      LEFT JOIN obsidian_farm_daily stats USING (farm_date)
      ORDER BY dates.farm_date
    `),
    pool.query(`
      WITH buckets AS (
        SELECT generate_series(
          date_trunc('hour', NOW() - INTERVAL '167 hours'),
          date_trunc('hour', NOW()),
          INTERVAL '1 hour'
        ) AS bucket
      )
      SELECT TO_CHAR(buckets.bucket, 'MM-DD HH24:00') AS label,
             buckets.bucket AS bucket,
             COALESCE(stats.mined, 0)::bigint AS mined
      FROM buckets
      LEFT JOIN obsidian_farm_hourly stats USING (bucket)
      ORDER BY buckets.bucket
    `),
    pool.query(`
      SELECT supplies, observed_at, updated_at
      FROM obsidian_farm_supply_snapshot
      WHERE id = 1
    `)
  ]);

  const farm = compactFarmState(farmResult.rows[0] || {});
  const hourly = hourlyResult.rows.map(row => ({
    label: row.label,
    bucket: row.bucket,
    value: toInt(row.mined)
  }));
  const daily = dailyResult.rows.map(row => ({
    label: row.label,
    bucket: row.bucket,
    value: toInt(row.mined)
  }));
  const last7Days = daily.slice(-7).reduce((sum, item) => sum + item.value, 0);

  return {
    farm: {
      ...farm,
      todayMined: toInt(todayResult.rows[0]?.mined),
      last7Days
    },
    hourly,
    daily,
    supplies: normalizeSupplySnapshot(supplyResult.rows[0])
  };
}

async function getServerStats() {
  assertDatabase();

  const [tpsSummaryResult, hourlyTpsResult, nearbyResult, recentPlayersResult] = await Promise.all([
    pool.query(`
      SELECT
        (SELECT tps FROM bot_tps_samples ORDER BY sampled_at DESC LIMIT 1) AS latest,
        (SELECT sampled_at FROM bot_tps_samples ORDER BY sampled_at DESC LIMIT 1) AS latest_at,
        ROUND(AVG(tps)::numeric, 1) AS average_24h,
        ROUND(MIN(tps)::numeric, 1) AS min_24h,
        ROUND(MAX(tps)::numeric, 1) AS max_24h,
        COUNT(*)::int AS samples_24h
      FROM bot_tps_samples
      WHERE sampled_at >= NOW() - INTERVAL '24 hours'
    `),
    pool.query(`
      WITH buckets AS (
        SELECT generate_series(
          date_trunc('hour', NOW() - INTERVAL '167 hours'),
          date_trunc('hour', NOW()),
          INTERVAL '1 hour'
        ) AS bucket
      )
      SELECT TO_CHAR(buckets.bucket, 'MM-DD HH24:00') AS label,
             buckets.bucket AS bucket,
             ROUND(AVG(samples.tps)::numeric, 1) AS avg_tps
      FROM buckets
      LEFT JOIN bot_tps_samples samples
        ON date_trunc('hour', samples.sampled_at) = buckets.bucket
      GROUP BY buckets.bucket
      ORDER BY buckets.bucket
    `),
    pool.query(`
      SELECT username, distance, last_seen
      FROM nearby_player_sightings
      ORDER BY last_seen DESC
      LIMIT 20
    `),
    pool.query(`
      SELECT pa.username,
             pa.last_seen,
             pt.tracking_since IS NOT NULL AS is_online
      FROM player_activity pa
      LEFT JOIN player_playtime pt ON LOWER(pt.username) = LOWER(pa.username)
      ORDER BY pa.last_seen DESC NULLS LAST
      LIMIT 20
    `)
  ]);

  const tpsRow = tpsSummaryResult.rows[0] || {};
  return {
    tps: {
      latest: tpsRow.latest == null ? null : toNumber(tpsRow.latest),
      latestAt: tpsRow.latest_at || null,
      average24h: tpsRow.average_24h == null ? null : toNumber(tpsRow.average_24h),
      min24h: tpsRow.min_24h == null ? null : toNumber(tpsRow.min_24h),
      max24h: tpsRow.max_24h == null ? null : toNumber(tpsRow.max_24h),
      samples24h: toInt(tpsRow.samples_24h)
    },
    hourlyTps: hourlyTpsResult.rows.map(row => ({
      label: row.label,
      bucket: row.bucket,
      value: row.avg_tps == null ? null : toNumber(row.avg_tps)
    })),
    nearby: nearbyResult.rows.map(row => ({
      username: row.username,
      distance: toInt(row.distance),
      lastSeen: row.last_seen
    })),
    recentPlayers: recentPlayersResult.rows.map(row => ({
      username: row.username,
      isOnline: Boolean(row.is_online),
      lastSeen: row.last_seen
    }))
  };
}

async function searchSeenPlayers(url) {
  assertDatabase();

  const query = String(url.searchParams.get('query') || '').trim();
  if (query.length < 1) {
    return { players: [] };
  }

  const result = await pool.query(`
    WITH names AS (
      SELECT username FROM whitelist
      UNION
      SELECT username FROM player_activity
      UNION
      SELECT username FROM player_playtime
    ),
    matched AS (
      SELECT
        names.username,
        EXISTS (
          SELECT 1 FROM whitelist w WHERE LOWER(w.username) = LOWER(names.username)
        ) AS is_whitelisted,
        pa.last_seen,
        pa.last_online,
        pt.tracking_since IS NOT NULL AS is_online,
        COALESCE(pt.total_seconds, 0) +
          CASE WHEN pt.tracking_since IS NULL THEN 0
               ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - pt.tracking_since)))::BIGINT)
          END AS total_seconds
      FROM names
      LEFT JOIN player_activity pa ON LOWER(pa.username) = LOWER(names.username)
      LEFT JOIN player_playtime pt ON LOWER(pt.username) = LOWER(names.username)
      WHERE LOWER(names.username) LIKE LOWER($1)
    )
    SELECT *
    FROM (
      SELECT DISTINCT ON (LOWER(username))
        username,
        is_whitelisted,
        last_seen,
        last_online,
        is_online,
        total_seconds
      FROM matched
      ORDER BY
        LOWER(username),
        is_whitelisted DESC,
        is_online DESC,
        last_seen DESC NULLS LAST,
        username
    ) deduped
    ORDER BY
      CASE WHEN LOWER(username) = LOWER($2) THEN 0 ELSE 1 END,
      is_online DESC,
      last_seen DESC NULLS LAST,
      LOWER(username)
    LIMIT 8
  `, [`%${query}%`, query]);

  return {
    players: result.rows.map(row => {
      const seconds = toInt(row.total_seconds);
      return {
        username: row.username,
        isWhitelisted: Boolean(row.is_whitelisted),
        isOnline: Boolean(row.is_online),
        lastSeen: row.last_seen,
        lastOnline: row.last_online,
        totalSeconds: seconds,
        playtime: formatSeconds(seconds)
      };
    })
  };
}

async function getPlayerProfile(url) {
  assertDatabase();

  const username = String(url.searchParams.get('username') || '').trim();
  if (!username) {
    const err = new Error('username is required.');
    err.statusCode = 400;
    throw err;
  }

  const [profileResult, chatResult, recentChatResult, nearbyResult] = await Promise.all([
    pool.query(`
      WITH names AS (
        SELECT username FROM whitelist WHERE LOWER(username) = LOWER($1)
        UNION
        SELECT username FROM player_activity WHERE LOWER(username) = LOWER($1)
        UNION
        SELECT username FROM player_playtime WHERE LOWER(username) = LOWER($1)
      ),
      selected AS (
        SELECT COALESCE((SELECT username FROM names LIMIT 1), $1) AS username
      )
      SELECT
        selected.username,
        EXISTS (
          SELECT 1 FROM whitelist w WHERE LOWER(w.username) = LOWER(selected.username)
        ) AS is_whitelisted,
        pa.last_seen,
        pa.last_online,
        pt.tracking_since,
        pt.tracking_since IS NOT NULL AS is_online,
        COALESCE(pt.total_seconds, 0) +
          CASE WHEN pt.tracking_since IS NULL THEN 0
               ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - pt.tracking_since)))::BIGINT)
          END AS total_seconds
      FROM selected
      LEFT JOIN player_activity pa ON LOWER(pa.username) = LOWER(selected.username)
      LEFT JOIN player_playtime pt ON LOWER(pt.username) = LOWER(selected.username)
    `, [username]),
    pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')::int AS last_24h,
        MAX(created_at) AS last_message_at
      FROM game_chat_messages
      WHERE LOWER(username) = LOWER($1)
    `, [username]),
    pool.query(`
      SELECT message, created_at
      FROM game_chat_messages
      WHERE LOWER(username) = LOWER($1)
      ORDER BY created_at DESC
      LIMIT 5
    `, [username]),
    pool.query(`
      SELECT distance, last_seen
      FROM nearby_player_sightings
      WHERE LOWER(username) = LOWER($1)
      ORDER BY last_seen DESC
      LIMIT 1
    `, [username])
  ]);

  const profile = profileResult.rows[0] || { username };
  const chat = chatResult.rows[0] || {};
  const nearby = nearbyResult.rows[0] || null;
  const seconds = toInt(profile.total_seconds);

  return {
    username: profile.username || username,
    isWhitelisted: Boolean(profile.is_whitelisted),
    isOnline: Boolean(profile.is_online),
    trackingSince: profile.tracking_since || null,
    lastSeen: profile.last_seen || null,
    lastOnline: profile.last_online || null,
    totalSeconds: seconds,
    playtime: formatSeconds(seconds),
    chat: {
      totalMessages: toInt(chat.total),
      last24h: toInt(chat.last_24h),
      lastMessageAt: chat.last_message_at || null,
      recentMessages: recentChatResult.rows.map(row => ({
        message: row.message,
        createdAt: row.created_at
      }))
    },
    nearby: nearby
      ? {
          distance: toInt(nearby.distance),
          lastSeen: nearby.last_seen
        }
      : null
  };
}

function publicUser(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    username: row.username,
    role: row.role,
    status: row.status,
    createdAt: row.created_at || null,
    approvedAt: row.approved_at || null
  };
}

async function getCurrentUser(req) {
  assertDatabase();
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return null;
  const result = await pool.query(`
    SELECT u.id, u.username, u.role, u.status, u.created_at, u.approved_at
    FROM site_sessions s
    JOIN site_users u ON u.id = s.user_id
    WHERE s.token_hash = $1
      AND s.expires_at > NOW()
      AND u.status = 'approved'
  `, [hashToken(token)]);
  return publicUser(result.rows[0]);
}

async function createSession(res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
  await pool.query(
    `INSERT INTO site_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)`,
    [hashToken(token), userId, expiresAt]
  );
  setSessionCookie(res, token);
}

function normalizeUsername(value) {
  return String(value || '').trim();
}

function validateCredentials(username, password) {
  if (!/^[A-Za-z0-9_.-]{2,64}$/.test(username)) {
    const err = new Error('Username must be 2-64 characters and use letters, numbers, dot, dash or underscore.');
    err.statusCode = 400;
    throw err;
  }
  if (String(password || '').length < 6 || String(password || '').length > 256) {
    const err = new Error('Password must be between 6 and 256 characters.');
    err.statusCode = 400;
    throw err;
  }
}

async function handleAuth(req, res, url) {
  assertDatabase();

  if (url.pathname === '/api/auth/me' && req.method === 'GET') {
    const user = await getCurrentUser(req);
    sendJson(res, 200, { authenticated: Boolean(user), user });
    return true;
  }

  if (url.pathname === '/api/auth/logout' && req.method === 'POST') {
    const token = parseCookies(req)[SESSION_COOKIE];
    if (token) {
      await pool.query(`DELETE FROM site_sessions WHERE token_hash = $1`, [hashToken(token)]);
    }
    clearSessionCookie(res);
    sendJson(res, 200, { ok: true });
    return true;
  }

  if (url.pathname === '/api/auth/register' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const username = normalizeUsername(body.username);
    const password = String(body.password || '');
    validateCredentials(username, password);

    const isAdmin = username.toLowerCase() === SITE_ADMIN_USERNAME.toLowerCase();
    const role = isAdmin ? 'admin' : 'user';
    const status = isAdmin ? 'approved' : 'pending';
    const existing = await pool.query(`SELECT id FROM site_users WHERE LOWER(username) = LOWER($1)`, [username]);
    if (existing.rowCount) {
      sendError(res, 409, 'This username is already registered.');
      return true;
    }

    const inserted = await pool.query(`
      INSERT INTO site_users (username, password_hash, role, status, approved_at)
      VALUES ($1, $2, $3::text, $4::text, CASE WHEN $4::text = 'approved' THEN NOW() ELSE NULL END)
      RETURNING id, username, role, status, created_at, approved_at
    `, [username, hashPassword(password), role, status]);

    if (isAdmin) {
      await createSession(res, inserted.rows[0].id);
      sendJson(res, 201, { authenticated: true, user: publicUser(inserted.rows[0]) });
      return true;
    }

    sendJson(res, 201, {
      authenticated: false,
      pendingApproval: true,
      message: 'Registration received. Wait until an admin approves your account.'
    });
    return true;
  }

  if (url.pathname === '/api/auth/login' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const username = normalizeUsername(body.username);
    const password = String(body.password || '');
    const result = await pool.query(`
      SELECT id, username, password_hash, role, status, created_at, approved_at
      FROM site_users
      WHERE LOWER(username) = LOWER($1)
    `, [username]);
    const user = result.rows[0];
    if (!user || !verifyPassword(password, user.password_hash)) {
      if (!user && username.toLowerCase() === SITE_ADMIN_USERNAME.toLowerCase()) {
        sendError(res, 401, 'Admin account is not created yet. Create account bdiev_ first, or set SITE_ADMIN_PASSWORD on the host and restart the site.');
        return true;
      }
      sendError(res, 401, 'Invalid username or password.');
      return true;
    }
    if (user.status !== 'approved') {
      sendError(res, 403, user.status === 'pending' ? 'Your account is waiting for admin approval.' : 'Your account is not approved.');
      return true;
    }
    await createSession(res, user.id);
    sendJson(res, 200, { authenticated: true, user: publicUser(user) });
    return true;
  }

  return false;
}

async function getAdminUsers(currentUser) {
  if (currentUser.role !== 'admin') {
    const err = new Error('Admin access required.');
    err.statusCode = 403;
    throw err;
  }
  const result = await pool.query(`
    SELECT id, username, role, status, created_at, approved_at
    FROM site_users
    ORDER BY
      CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
      created_at DESC
  `);
  return { users: result.rows.map(publicUser) };
}

async function updateAdminUser(currentUser, body) {
  if (currentUser.role !== 'admin') {
    const err = new Error('Admin access required.');
    err.statusCode = 403;
    throw err;
  }
  const username = normalizeUsername(body.username);
  const action = String(body.action || '');
  if (!username) {
    const err = new Error('Username is required.');
    err.statusCode = 400;
    throw err;
  }
  if (username.toLowerCase() === SITE_ADMIN_USERNAME.toLowerCase() && ['reject', 'remove_admin'].includes(action)) {
    const err = new Error('The primary admin cannot be rejected or demoted.');
    err.statusCode = 400;
    throw err;
  }

  if (action === 'approve') {
    await pool.query(`
      UPDATE site_users
      SET status = 'approved', approved_by = $1, approved_at = NOW()
      WHERE LOWER(username) = LOWER($2)
    `, [currentUser.id, username]);
  } else if (action === 'reject') {
    const removed = await pool.query(
      `DELETE FROM site_users WHERE LOWER(username) = LOWER($1) RETURNING id`,
      [username]
    );
    if (!removed.rowCount) {
      const err = new Error('User not found.');
      err.statusCode = 404;
      throw err;
    }
  } else if (action === 'make_admin') {
    await pool.query(`
      UPDATE site_users
      SET role = 'admin', status = 'approved', approved_by = $1, approved_at = COALESCE(approved_at, NOW())
      WHERE LOWER(username) = LOWER($2)
    `, [currentUser.id, username]);
  } else if (action === 'remove_admin') {
    await pool.query(`UPDATE site_users SET role = 'user' WHERE LOWER(username) = LOWER($1)`, [username]);
  } else {
    const err = new Error('Unknown admin action.');
    err.statusCode = 400;
    throw err;
  }

  return getAdminUsers(currentUser);
}

async function handleApi(req, res, url) {
  try {
    if (url.pathname === '/api/health') {
      sendJson(res, 200, { ok: true, database: Boolean(pool) });
      return;
    }
    if (url.pathname.startsWith('/api/auth/')) {
      if (await handleAuth(req, res, url)) return;
      sendError(res, 404, 'Auth route not found.');
      return;
    }

    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      sendError(res, 401, 'Login required.');
      return;
    }

    if (url.pathname === '/api/admin/users') {
      if (req.method === 'GET') {
        sendJson(res, 200, await getAdminUsers(currentUser));
        return;
      }
      if (req.method === 'POST') {
        sendJson(res, 200, await updateAdminUser(currentUser, await readJsonBody(req)));
        return;
      }
    }

    if (url.pathname === '/api/summary') {
      sendJson(res, 200, await getSummary());
      return;
    }
    if (url.pathname === '/api/players') {
      sendJson(res, 200, await getPlayers());
      return;
    }
    if (url.pathname === '/api/chat') {
      sendJson(res, 200, await getChat(url));
      return;
    }
    if (url.pathname === '/api/chat/send' && req.method === 'POST') {
      sendJson(res, 202, await queueSiteChatMessage(currentUser, await readJsonBody(req)));
      return;
    }
    if (url.pathname === '/api/bot-stats') {
      sendJson(res, 200, await getBotStats());
      return;
    }
    if (url.pathname === '/api/obsidian') {
      sendJson(res, 200, await getObsidianStats());
      return;
    }
    if (url.pathname === '/api/server-stats') {
      sendJson(res, 200, await getServerStats());
      return;
    }
    if (url.pathname === '/api/seen-search') {
      sendJson(res, 200, await searchSeenPlayers(url));
      return;
    }
    if (url.pathname === '/api/player') {
      sendJson(res, 200, await getPlayerProfile(url));
      return;
    }
    sendError(res, 404, 'API route not found.');
  } catch (err) {
    sendError(res, err.statusCode || 500, err.message || 'Internal server error.');
  }
}

function serveStatic(req, res, url) {
  const requestPath = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  const filePath = path.normalize(path.join(PUBLIC_DIR, requestPath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (path.extname(filePath)) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (fallbackErr, fallback) => {
        if (fallbackErr) {
          res.writeHead(500);
          res.end('Site is not built.');
          return;
        }
        res.writeHead(200, { 'Content-Type': MIME_TYPES['.html'] });
        res.end(fallback);
      });
      return;
    }

    const type = MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) {
    handleApi(req, res, url);
    return;
  }
  serveStatic(req, res, url);
});

ensureOptionalTables()
  .catch(err => {
    console.error('[Site] Failed to ensure optional tables:', err.message);
  })
  .finally(() => {
    server.listen(PORT, () => {
      console.log(`[Site] WheatMagnateBot site: http://localhost:${PORT}`);
      console.log(`[Site] Static files: ${pathToFileURL(PUBLIC_DIR).href}`);
    });
  });

process.on('SIGINT', async () => {
  server.close();
  if (pool) await pool.end().catch(() => {});
  process.exit(0);
});
