'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { Pool } = require('pg');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const PORT = Number(process.env.SITE_PORT || process.env.PORT) || 3080;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATABASE_URL = process.env.DATABASE_URL;
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
    CREATE TABLE IF NOT EXISTS obsidian_farm_supply_snapshot (
      id SMALLINT PRIMARY KEY CHECK (id = 1),
      supplies JSONB NOT NULL,
      observed_at TIMESTAMPTZ,
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
          date_trunc('hour', NOW() - INTERVAL '23 hours'),
          date_trunc('hour', NOW()),
          INTERVAL '1 hour'
        ) AS bucket
      )
      SELECT TO_CHAR(buckets.bucket, 'HH24:00') AS label,
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
      LIMIT 10
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

  const [farmResult, todayResult, dailyResult, supplyResult] = await Promise.all([
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
          (NOW() AT TIME ZONE 'Europe/Kyiv')::date - 13,
          (NOW() AT TIME ZONE 'Europe/Kyiv')::date,
          INTERVAL '1 day'
        )::date AS farm_date
      )
      SELECT TO_CHAR(dates.farm_date, 'MM-DD') AS label,
             COALESCE(stats.mined, 0)::bigint AS mined
      FROM dates
      LEFT JOIN obsidian_farm_daily stats USING (farm_date)
      ORDER BY dates.farm_date
    `),
    pool.query(`
      SELECT supplies, observed_at, updated_at
      FROM obsidian_farm_supply_snapshot
      WHERE id = 1
    `)
  ]);

  const farm = compactFarmState(farmResult.rows[0] || {});
  const daily = dailyResult.rows.map(row => ({
    label: row.label,
    value: toInt(row.mined)
  }));
  const last7Days = daily.slice(-7).reduce((sum, item) => sum + item.value, 0);

  return {
    farm: {
      ...farm,
      todayMined: toInt(todayResult.rows[0]?.mined),
      last7Days
    },
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
          date_trunc('hour', NOW() - INTERVAL '23 hours'),
          date_trunc('hour', NOW()),
          INTERVAL '1 hour'
        ) AS bucket
      )
      SELECT TO_CHAR(buckets.bucket, 'HH24:00') AS label,
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
    )
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
    ORDER BY
      CASE WHEN LOWER(names.username) = LOWER($2) THEN 0 ELSE 1 END,
      pt.tracking_since IS NOT NULL DESC,
      pa.last_seen DESC NULLS LAST,
      LOWER(names.username)
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

async function handleApi(req, res, url) {
  try {
    if (url.pathname === '/api/health') {
      sendJson(res, 200, { ok: true, database: Boolean(pool) });
      return;
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
