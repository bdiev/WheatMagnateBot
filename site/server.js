'use strict';

const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { Pool } = require('pg');
const { runMigrations } = require('./migrations');
const { SseHub, handleSseRequest } = require('./sse');
const { calculateAnalytics } = require('./obsidian-analytics');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const PORT = Number(process.env.SITE_PORT || process.env.PORT) || 3080;
const PUBLIC_DIR = path.join(__dirname, 'public');
const ITEMS_DIR = path.join(__dirname, 'items');
const FOOD_DIR = path.join(__dirname, 'food');
const LOGOS_DIR = path.join(__dirname, 'logos');
const DATABASE_URL = process.env.DATABASE_URL;
const SITE_ADMIN_USERNAME = 'bdiev_';
const SITE_ADMIN_PASSWORD = process.env.SITE_ADMIN_PASSWORD || '';
const SESSION_COOKIE = 'wm_session';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const pool = DATABASE_URL
  ? new Pool({ connectionString: DATABASE_URL })
  : null;
const sseHub = new SseHub({
  maxConnectionsPerUser: Number(process.env.SSE_MAX_CONNECTIONS_PER_USER) || 3,
  heartbeatMs: Number(process.env.SSE_HEARTBEAT_MS) || 25_000
});
let databaseEventTimer = null;
let databaseEventPollRunning = false;
let databaseEventState = null;
let lastDatabaseEventErrorAt = 0;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
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

function sendCsv(res, filename, rows) {
  const escape = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const body = rows.map(row => row.map(escape).join(',')).join('\n');
  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'no-store'
  });
  res.end(`\uFEFF${body}`);
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

async function recordSystemLog({ level = 'info', category = 'site', actor = null, message = '', details = null } = {}) {
  if (!pool || !message) return;
  const safeLevel = ['debug', 'info', 'warn', 'error', 'audit'].includes(level) ? level : 'info';
  const safeCategory = String(category || 'site').trim().slice(0, 64) || 'site';
  const safeActor = actor ? String(actor).trim().slice(0, 64) : null;
  try {
    await pool.query(`
      INSERT INTO site_system_logs (level, category, actor_username, message, details)
      VALUES ($1, $2, $3, $4, $5)
    `, [safeLevel, safeCategory, safeActor, String(message).slice(0, 2000), details || null]);
  } catch (err) {
    console.error('[SiteLog] Failed to write system log:', err.message);
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

function parsePlaytimeSeconds(value) {
  const input = String(value || '').trim();
  if (!input) return null;

  const units = {
    d: 86400, day: 86400, days: 86400,
    h: 3600, hour: 3600, hours: 3600,
    m: 60, min: 60, mins: 60, minute: 60, minutes: 60,
    s: 1, sec: 1, secs: 1, second: 1, seconds: 1
  };
  let total = 0;
  let matches = 0;
  const tokenPattern = /(\d+)\s*(days?|d|hours?|h|minutes?|mins?|m|seconds?|secs?|s)\b/gi;
  const remainder = input.replace(tokenPattern, (_, amount, unit) => {
    total += Number(amount) * units[unit.toLowerCase()];
    matches += 1;
    return '';
  }).replace(/[\s,]+/g, '');

  return matches > 0 && !remainder && Number.isSafeInteger(total) ? total : null;
}

function parseRegistrationDate(value) {
  const match = String(value || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, month, day, year, hour, minute, second] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (!Number.isFinite(date.getTime())) return null;
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute ||
    date.getUTCSeconds() !== second
  ) {
    return null;
  }
  return date;
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function utcDateOnly(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function anniversaryUtcDate(startDate, year) {
  const month = startDate.getUTCMonth();
  const day = startDate.getUTCDate();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, lastDay)));
}

function buildPlayerMilestones(rows, { daysAhead = 365, limit = 12 } = {}) {
  const today = utcDateOnly(new Date());
  if (!today) return [];
  const dayMs = 24 * 60 * 60 * 1000;

  return rows
    .map(row => {
      const registeredAt = utcDateOnly(row.registration_at);
      if (!registeredAt || registeredAt > today) return null;

      let targetYear = today.getUTCFullYear();
      let milestoneAt = anniversaryUtcDate(registeredAt, targetYear);
      if (milestoneAt < today) {
        targetYear += 1;
        milestoneAt = anniversaryUtcDate(registeredAt, targetYear);
      }

      const years = targetYear - registeredAt.getUTCFullYear();
      const daysUntil = Math.round((milestoneAt - today) / dayMs);
      if (years < 1 || daysUntil < 0 || daysUntil > daysAhead) return null;

      return {
        username: row.username,
        years,
        daysUntil,
        milestoneAt: milestoneAt.toISOString(),
        registeredAt: row.registration_at,
        isRound: years % 5 === 0
      };
    })
    .filter(Boolean)
    .sort((a, b) => (a.daysUntil - b.daysUntil) || (b.years - a.years) || a.username.localeCompare(b.username))
    .slice(0, limit);
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

function normalizeItemIconName(fileName) {
  return path.basename(fileName, path.extname(fileName))
    .replace(/\s+\(\d+\)$/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

async function getItemIcons() {
  const icons = {};

  const addIconsFromDirectory = async (directory, publicPrefix) => {
    const entries = await fs.promises.readdir(directory, { withFileTypes: true }).catch(() => []);
    entries
      .filter(entry => entry.isFile() && /\.(png|jpe?g|webp)$/i.test(entry.name))
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach(entry => {
        const key = normalizeItemIconName(entry.name);
        if (!key || icons[key]) return;
        icons[key] = `${publicPrefix}/${encodeURIComponent(entry.name)}`;
      });
  };

  await addIconsFromDirectory(ITEMS_DIR, '/items');
  await addIconsFromDirectory(FOOD_DIR, '/food');

  return { icons };
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
        displayName: item.displayName || null,
        label: normalizeItemName(item.name),
        count: toInt(item.count),
        slot: item.slot == null ? null : toInt(item.slot),
        enchantments: Array.isArray(item.enchantments)
          ? item.enchantments.map(enchant => ({
              name: String(enchant.name || '').replace(/^minecraft:/, ''),
              level: toInt(enchant.level ?? enchant.lvl, 1)
            })).filter(enchant => enchant.name)
          : [],
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
  await runMigrations(pool);
  await pool.query(`INSERT INTO obsidian_farm_analytics_settings(id,timezone,daily_report_enabled,daily_report_hour)
    VALUES(1,$1,$2,$3) ON CONFLICT(id) DO NOTHING`, [
    process.env.OBSIDIAN_ANALYTICS_TIMEZONE || 'Europe/Vilnius',
    process.env.OBSIDIAN_DAILY_REPORT_ENABLED !== 'false',
    Math.max(0, Math.min(23, Number(process.env.OBSIDIAN_DAILY_REPORT_HOUR ?? 9)))
  ]);
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
    CREATE TABLE IF NOT EXISTS ignored_users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(255) UNIQUE NOT NULL,
      added_by VARCHAR(255),
      added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS whitelist (
      id SERIAL PRIMARY KEY,
      username VARCHAR(255) UNIQUE NOT NULL,
      added_by VARCHAR(255),
      added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS player_activity (
      id SERIAL PRIMARY KEY,
      username VARCHAR(255) UNIQUE NOT NULL,
      last_seen TIMESTAMP,
      last_online TIMESTAMP,
      registration_at TIMESTAMPTZ,
      is_online BOOLEAN DEFAULT FALSE
    )
  `);
  await pool.query(`ALTER TABLE player_activity ALTER COLUMN last_seen DROP DEFAULT`);
  await pool.query(`ALTER TABLE player_activity ALTER COLUMN last_online DROP DEFAULT`);
  await pool.query(`ALTER TABLE player_activity ADD COLUMN IF NOT EXISTS registration_at TIMESTAMPTZ`);
  await pool.query(`
    UPDATE player_activity
    SET registration_at = COALESCE(last_online, last_seen, NOW())
    WHERE registration_at IS NULL
  `);
  await pool.query(`
    WITH ranked AS (
      SELECT
        id,
        LOWER(username) AS username_key,
        ROW_NUMBER() OVER (
          PARTITION BY LOWER(username)
          ORDER BY is_online DESC, COALESCE(last_seen, last_online, registration_at) DESC NULLS LAST, id DESC
        ) AS rn,
        MAX(last_seen) OVER (PARTITION BY LOWER(username)) AS merged_last_seen,
        MAX(last_online) OVER (PARTITION BY LOWER(username)) AS merged_last_online,
        MIN(registration_at) OVER (PARTITION BY LOWER(username)) AS merged_registration_at,
        BOOL_OR(is_online) OVER (PARTITION BY LOWER(username)) AS merged_is_online
      FROM player_activity
    ),
    updated AS (
      UPDATE player_activity pa
      SET last_seen = ranked.merged_last_seen,
          last_online = ranked.merged_last_online,
          registration_at = ranked.merged_registration_at,
          is_online = ranked.merged_is_online
      FROM ranked
      WHERE pa.id = ranked.id
        AND ranked.rn = 1
      RETURNING pa.id
    )
    DELETE FROM player_activity pa
    USING ranked
    WHERE pa.id = ranked.id
      AND ranked.rn > 1
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS player_activity_username_lower_unique_idx
    ON player_activity (LOWER(username))
  `);
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
    CREATE TABLE IF NOT EXISTS site_whisper_messages (
      id BIGSERIAL PRIMARY KEY,
      player_username VARCHAR(255) NOT NULL,
      direction VARCHAR(16) NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
      site_username VARCHAR(64),
      message TEXT NOT NULL,
      delivery_status VARCHAR(16) NOT NULL DEFAULT 'delivered'
        CHECK (delivery_status IN ('sent', 'delivered')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    ALTER TABLE site_whisper_messages
    ADD COLUMN IF NOT EXISTS delivery_status VARCHAR(16) NOT NULL DEFAULT 'delivered'
  `);
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'site_whisper_messages_delivery_status_check'
      ) THEN
        ALTER TABLE site_whisper_messages
        ADD CONSTRAINT site_whisper_messages_delivery_status_check
        CHECK (delivery_status IN ('sent', 'delivered'));
      END IF;
    END $$;
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS site_whisper_messages_player_created_idx
    ON site_whisper_messages (LOWER(player_username), created_at DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS site_whisper_messages_site_player_created_idx
    ON site_whisper_messages (LOWER(site_username), LOWER(player_username), created_at DESC)
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS site_whisper_read_state (
      site_user_id BIGINT NOT NULL REFERENCES site_users(id) ON DELETE CASCADE,
      player_key VARCHAR(32) NOT NULL,
      player_username VARCHAR(255) NOT NULL,
      last_read_message_id BIGINT NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (site_user_id, player_key)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bot_commands (
      id BIGSERIAL PRIMARY KEY,
      source VARCHAR(32) NOT NULL,
      requested_by VARCHAR(255),
      command_type VARCHAR(64) NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      result JSONB,
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      started_at TIMESTAMPTZ,
      finished_at TIMESTAMPTZ
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS bot_commands_status_created_idx
    ON bot_commands (status, created_at)
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS site_system_logs (
      id BIGSERIAL PRIMARY KEY,
      level VARCHAR(16) NOT NULL DEFAULT 'info',
      category VARCHAR(64) NOT NULL DEFAULT 'site',
      actor_username VARCHAR(64),
      message TEXT NOT NULL,
      details JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS site_system_logs_created_at_idx
    ON site_system_logs (created_at DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS site_system_logs_level_created_idx
    ON site_system_logs (level, created_at DESC)
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_settings (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bot_status_snapshots (
      id SMALLINT PRIMARY KEY CHECK (id = 1),
      status JSONB NOT NULL,
      observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
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
      WITH whitelist_players AS (
        SELECT DISTINCT ON (LOWER(username))
          LOWER(username) AS username_key,
          username
        FROM whitelist
        ORDER BY LOWER(username), id
      ),
      activity AS (
      SELECT DISTINCT ON (LOWER(username))
        LOWER(username) AS username_key,
        is_online
      FROM player_activity
        ORDER BY LOWER(username), is_online DESC, COALESCE(last_seen, last_online) DESC NULLS LAST, id DESC
      )
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE pa.is_online = TRUE)::int AS online
      FROM whitelist_players w
      LEFT JOIN activity pa ON pa.username_key = w.username_key
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
    WITH whitelist_players AS (
      SELECT DISTINCT ON (LOWER(username))
        LOWER(username) AS username_key,
        username
      FROM whitelist
      ORDER BY LOWER(username), id
    ),
    activity AS (
      SELECT DISTINCT ON (LOWER(username))
        LOWER(username) AS username_key,
        last_seen,
        last_online,
        is_online
      FROM player_activity
      ORDER BY LOWER(username), is_online DESC, COALESCE(last_seen, last_online) DESC NULLS LAST, id DESC
    ),
    playtime AS (
      SELECT
        LOWER(username) AS username_key,
        SUM(total_seconds)::BIGINT AS total_seconds,
        MIN(tracking_since) FILTER (WHERE tracking_since IS NOT NULL) AS tracking_since
      FROM player_playtime
      GROUP BY LOWER(username)
    )
    SELECT
      w.username,
      pa.last_seen,
      pa.last_online,
      COALESCE(pa.is_online, FALSE) AS is_online,
      COALESCE(pt.total_seconds, 0) +
        CASE WHEN pt.tracking_since IS NULL THEN 0
             ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - pt.tracking_since)))::BIGINT)
        END AS total_seconds
    FROM whitelist_players w
    LEFT JOIN activity pa ON pa.username_key = w.username_key
    LEFT JOIN playtime pt ON pt.username_key = w.username_key
    ORDER BY
      COALESCE(pa.is_online, FALSE) DESC,
      total_seconds DESC,
      w.username_key
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
  const [messagesResult, activityResult, hourlyResult, topChattersResult, totalsResult] = await Promise.all([
    pool.query(`
      SELECT id, username, message, created_at
      FROM game_chat_messages
      ORDER BY created_at DESC
      LIMIT $1
    `, [limit]),
    pool.query(`
      SELECT
        username,
        is_online,
        CASE
          WHEN is_online THEN last_online
          ELSE last_seen
        END AS event_at
      FROM player_activity
      WHERE CASE
          WHEN is_online THEN last_online
          ELSE last_seen
        END >= NOW() - INTERVAL '24 hours'
      ORDER BY event_at DESC NULLS LAST
      LIMIT 40
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

  const chatMessages = messagesResult.rows.map(row => ({
      id: row.id,
      type: 'chat',
      username: row.username,
      message: row.message,
      createdAt: row.created_at
    }));
  const activityMessages = activityResult.rows
    .filter(row => row.event_at)
    .map(row => ({
      id: `activity:${String(row.username).toLowerCase()}:${row.is_online ? 'join' : 'leave'}:${new Date(row.event_at).getTime()}`,
      type: 'activity',
      username: row.username,
      event: row.is_online ? 'join' : 'leave',
      message: row.is_online ? 'joined the game' : 'left the game',
      createdAt: row.event_at
    }));

  return {
    latestId: messagesResult.rows[0]?.id == null ? '0' : String(messagesResult.rows[0].id),
    messages: [...chatMessages, ...activityMessages]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
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

async function queueBotCommand(currentUser, commandType, payload = {}, { source = 'site' } = {}) {
  assertDatabase();
  const safeCommandType = String(commandType || '').trim().toLowerCase();
  if (!safeCommandType) {
    const err = new Error('Command type is required.');
    err.statusCode = 400;
    throw err;
  }

  const result = await pool.query(`
    INSERT INTO bot_commands (source, requested_by, command_type, payload)
    VALUES ($1, $2, $3, $4)
    RETURNING id, source, requested_by, command_type, payload, status, created_at
  `, [source, currentUser?.username || null, safeCommandType, payload || {}]);

  const row = result.rows[0];
  return {
    queued: true,
    command: {
      id: String(row.id),
      source: row.source,
      requestedBy: row.requested_by,
      commandType: row.command_type,
      payload: row.payload,
      status: row.status,
      createdAt: row.created_at
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
  return queueBotCommand(currentUser, 'chat', { message });
}

function cleanMinecraftUsername(value) {
  return String(value || '')
    .replace(/[^A-Za-z0-9_]/g, '')
    .trim()
    .slice(0, 32);
}

function cleanWhisperMessage(value) {
  return String(value || '')
    .replace(/\u00a7[0-9a-fk-or]/gi, '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
}

function parseWhisperReadState(url) {
  try {
    const raw = String(url.searchParams.get('readState') || '{}');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed)
      .map(([username, id]) => [
        cleanMinecraftUsername(username).toLowerCase(),
        String(id || '0').replace(/[^\d]/g, '') || '0'
      ])
      .filter(([username]) => username));
  } catch (_) {
    return {};
  }
}

async function getWhisperOnlinePlayers(currentUser, url) {
  assertDatabase();
  const result = await pool.query(`
    WITH read_state AS (
      SELECT player_key, last_read_message_id AS read_id
      FROM site_whisper_read_state
      WHERE site_user_id = $2
    ),
    owned_dialogs AS (
      SELECT player_username
      FROM site_whisper_messages
      WHERE LOWER(site_username) = LOWER($1)
      GROUP BY LOWER(player_username), player_username
    ),
    dialog_players AS (
      SELECT
        messages.player_username,
        MAX(messages.created_at) AS last_message_at,
        COUNT(*)::int AS message_count,
        COUNT(*) FILTER (
          WHERE messages.direction = 'incoming'
            AND messages.id > COALESCE(read_state.read_id, 0)
        )::int AS unread_count
      FROM site_whisper_messages messages
      JOIN owned_dialogs dialogs ON LOWER(dialogs.player_username) = LOWER(messages.player_username)
      LEFT JOIN read_state ON read_state.player_key = LOWER(messages.player_username)
      WHERE (
          messages.direction = 'outgoing'
          AND LOWER(messages.site_username) = LOWER($1)
        )
        OR (
          messages.direction = 'incoming'
          AND (messages.site_username IS NULL OR LOWER(messages.site_username) = LOWER($1))
        )
      GROUP BY LOWER(messages.player_username), messages.player_username, read_state.read_id
    ),
    names AS (
      SELECT username FROM player_activity WHERE is_online = TRUE
      UNION
      SELECT player_username AS username FROM dialog_players
    ),
    activity AS (
      SELECT DISTINCT ON (LOWER(username))
        LOWER(username) AS username_key,
        username,
        last_seen,
        last_online,
        is_online
      FROM player_activity
      ORDER BY LOWER(username), is_online DESC, COALESCE(last_seen, last_online) DESC NULLS LAST, id DESC
    )
    SELECT DISTINCT ON (LOWER(names.username))
      COALESCE(dialogs.player_username, pa.username, names.username) AS username,
      pa.last_seen,
      pa.last_online,
      COALESCE(pa.is_online, FALSE) AS is_online,
      EXISTS (
        SELECT 1 FROM whitelist w WHERE LOWER(w.username) = LOWER(names.username)
      ) AS is_whitelisted,
      dialogs.last_message_at,
      COALESCE(dialogs.message_count, 0)::int AS message_count,
      COALESCE(dialogs.unread_count, 0)::int AS unread_count
    FROM names
    LEFT JOIN activity pa ON pa.username_key = LOWER(names.username)
    LEFT JOIN dialog_players dialogs ON LOWER(dialogs.player_username) = LOWER(names.username)
    ORDER BY
      LOWER(names.username),
      dialogs.last_message_at DESC NULLS LAST,
      COALESCE(pa.is_online, FALSE) DESC
  `, [currentUser.username, currentUser.id]);

  return {
    players: result.rows
      .map(row => ({
        username: row.username,
        isOnline: Boolean(row.is_online),
        isWhitelisted: Boolean(row.is_whitelisted),
        lastSeen: row.last_seen,
        lastOnline: row.last_online,
        lastMessageAt: row.last_message_at,
        messageCount: toInt(row.message_count),
        unreadCount: toInt(row.unread_count)
      }))
      .sort((a, b) => {
        const priority = player => {
          if (player.messageCount > 0) return 0;
          if (player.isOnline && player.isWhitelisted) return 1;
          return 2;
        };
        const priorityDiff = priority(a) - priority(b);
        if (priorityDiff !== 0) return priorityDiff;
        return a.username.localeCompare(b.username, undefined, { sensitivity: 'base' });
      })
  };
}

async function getWhisperDialog(currentUser, url) {
  assertDatabase();
  const username = cleanMinecraftUsername(url.searchParams.get('username'));
  if (!username) {
    const err = new Error('Player username is required.');
    err.statusCode = 400;
    throw err;
  }

  const limit = Math.min(120, Math.max(1, toInt(url.searchParams.get('limit'), 80)));
  const playerResult = await pool.query(`
    SELECT username, last_seen, last_online, COALESCE(is_online, FALSE) AS is_online
    FROM (
      SELECT DISTINCT ON (LOWER(username))
        username,
        last_seen,
        last_online,
        is_online
      FROM player_activity
      WHERE LOWER(username) = LOWER($1)
      ORDER BY LOWER(username), is_online DESC, COALESCE(last_seen, last_online) DESC NULLS LAST, id DESC
    ) activity
    LIMIT 1
  `, [username]);
  const player = playerResult.rows[0]
    ? {
        username: playerResult.rows[0].username,
        isOnline: Boolean(playerResult.rows[0].is_online),
        lastSeen: playerResult.rows[0].last_seen,
        lastOnline: playerResult.rows[0].last_online
      }
    : {
        username,
        isOnline: false,
        lastSeen: null,
        lastOnline: null
      };
  const owned = await pool.query(`
    SELECT 1
    FROM site_whisper_messages
    WHERE LOWER(player_username) = LOWER($1)
      AND LOWER(site_username) = LOWER($2)
    LIMIT 1
  `, [username, currentUser.username]);

  if (!owned.rowCount) {
    return { username, player, messages: [] };
  }

  const result = await pool.query(`
    SELECT id, player_username, direction, site_username, message, delivery_status, created_at
    FROM site_whisper_messages
    WHERE LOWER(player_username) = LOWER($1)
      AND (
        (
          direction = 'outgoing'
          AND LOWER(site_username) = LOWER($2)
        )
        OR (
          direction = 'incoming'
          AND (site_username IS NULL OR LOWER(site_username) = LOWER($2))
        )
      )
    ORDER BY created_at DESC
    LIMIT $3
  `, [username, currentUser.username, limit]);

  return {
    username,
    player,
    messages: result.rows.reverse().map(row => ({
      id: String(row.id),
      playerUsername: row.player_username,
      direction: row.direction,
      siteUsername: row.site_username,
      message: row.message,
      deliveryStatus: row.delivery_status || 'delivered',
      createdAt: row.created_at
    }))
  };
}

async function deleteWhisperDialog(currentUser, body) {
  assertDatabase();
  const username = cleanMinecraftUsername(body.username);
  if (!username) {
    const err = new Error('Player username is required.');
    err.statusCode = 400;
    throw err;
  }

  const result = await pool.query(
    `DELETE FROM site_whisper_messages
     WHERE LOWER(player_username) = LOWER($1)
       AND LOWER(site_username) = LOWER($2)`,
    [username, currentUser.username]
  );

  return {
    ok: true,
    username,
    deleted: result.rowCount
  };
}

async function getWhisperNotifications(currentUser, url) {
  assertDatabase();
  const result = await pool.query(`
    WITH owned_dialogs AS (
      SELECT player_username
      FROM site_whisper_messages
      WHERE LOWER(site_username) = LOWER($2)
      GROUP BY LOWER(player_username), player_username
    ),
    visible_messages AS (
      SELECT messages.id, messages.direction, LOWER(messages.player_username) AS player_key
      FROM site_whisper_messages messages
      JOIN owned_dialogs dialogs ON LOWER(dialogs.player_username) = LOWER(messages.player_username)
      WHERE (
          messages.direction = 'outgoing'
          AND LOWER(messages.site_username) = LOWER($2)
        )
        OR (
          messages.direction = 'incoming'
          AND (messages.site_username IS NULL OR LOWER(messages.site_username) = LOWER($2))
        )
    )
    SELECT
      COALESCE(MAX(id), 0)::text AS max_id,
      COUNT(*) FILTER (
        WHERE visible_messages.direction = 'incoming'
          AND visible_messages.id > COALESCE(read_state.last_read_message_id, 0)
      )::int AS unread_count
    FROM visible_messages
    LEFT JOIN site_whisper_read_state read_state
      ON read_state.site_user_id = $1
      AND read_state.player_key = visible_messages.player_key
  `, [currentUser.id, currentUser.username]);
  const row = result.rows[0] || {};

  return {
    maxId: row.max_id || '0',
    unreadCount: toInt(row.unread_count)
  };
}

async function markWhisperRead(currentUser, body) {
  assertDatabase();
  const username = cleanMinecraftUsername(body.username);
  const rawMessageId = String(body.messageId || '0').replace(/[^\d]/g, '');
  const messageId = rawMessageId || '0';
  const legacyReadState = body.readState && typeof body.readState === 'object' && !Array.isArray(body.readState)
    ? body.readState
    : null;

  if (legacyReadState) {
    const entries = Object.entries(legacyReadState)
      .map(([rawUsername, rawId]) => ({
        username: cleanMinecraftUsername(rawUsername),
        id: String(rawId || '0').replace(/[^\d]/g, '') || '0'
      }))
      .filter(entry => entry.username && Number(entry.id) > 0);

    for (const entry of entries) {
      await pool.query(`
        INSERT INTO site_whisper_read_state (site_user_id, player_key, player_username, last_read_message_id, updated_at)
        VALUES ($1, LOWER($2), $2, $3::bigint, NOW())
        ON CONFLICT (site_user_id, player_key) DO UPDATE
        SET player_username = EXCLUDED.player_username,
            last_read_message_id = GREATEST(site_whisper_read_state.last_read_message_id, EXCLUDED.last_read_message_id::bigint),
            updated_at = NOW()
      `, [currentUser.id, entry.username, entry.id]);
    }
  }

  if (username && Number(messageId) > 0) {
    await pool.query(`
      INSERT INTO site_whisper_read_state (site_user_id, player_key, player_username, last_read_message_id, updated_at)
      VALUES ($1, LOWER($2), $2, $3::bigint, NOW())
      ON CONFLICT (site_user_id, player_key) DO UPDATE
      SET player_username = EXCLUDED.player_username,
          last_read_message_id = GREATEST(site_whisper_read_state.last_read_message_id, EXCLUDED.last_read_message_id::bigint),
          updated_at = NOW()
    `, [currentUser.id, username, messageId]);
  }

  return getWhisperNotifications(currentUser, new URL('http://localhost/api/whisper/notifications'));
}

async function queueSiteWhisperMessage(currentUser, body) {
  assertDatabase();
  const username = cleanMinecraftUsername(body.username);
  const message = cleanWhisperMessage(body.message);
  if (!username) {
    const err = new Error('Player username is required.');
    err.statusCode = 400;
    throw err;
  }
  if (!message) {
    const err = new Error('Message is required.');
    err.statusCode = 400;
    throw err;
  }
  if (message.startsWith('/') || message.startsWith('!')) {
    const err = new Error('Commands cannot be sent as private messages.');
    err.statusCode = 400;
    throw err;
  }

  const inserted = await pool.query(`
    INSERT INTO site_whisper_messages (player_username, direction, site_username, message, delivery_status)
    VALUES ($1, 'outgoing', $2, $3, 'sent')
    RETURNING id
  `, [username, currentUser?.username || null, message]);

  const queued = await queueBotCommand(currentUser, 'site_whisper', {
    username,
    message,
    messageId: String(inserted.rows[0]?.id || '')
  });
  return {
    ...queued,
    username,
    message
  };
}

async function getBotStats() {
  assertDatabase();

  const result = await pool.query(`
    SELECT status, observed_at
    FROM bot_status_snapshots
    WHERE id = 1
  `);
  const row = result.rows[0] || {};
  return {
    bot: row.status || null,
    observedAt: row.observed_at || null
  };
}

async function getPlayerStats() {
  assertDatabase();

  const [
    playersResult,
    leaderboardResult,
    activityTotalsResult,
    onlineUnwhitelistedResult,
    hourlyUnwhitelistedResult,
    milestoneResult
  ] = await Promise.all([
    pool.query(`
      WITH whitelist_players AS (
        SELECT DISTINCT ON (LOWER(username))
          LOWER(username) AS username_key,
          username
        FROM whitelist
        ORDER BY LOWER(username), id
      ),
      activity AS (
        SELECT DISTINCT ON (LOWER(username))
          LOWER(username) AS username_key,
          is_online
        FROM player_activity
        ORDER BY LOWER(username), is_online DESC, COALESCE(last_seen, last_online) DESC NULLS LAST, id DESC
      )
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE pa.is_online = TRUE)::int AS online,
        COUNT(*) FILTER (WHERE COALESCE(pa.is_online, FALSE) = FALSE)::int AS offline
      FROM whitelist_players w
      LEFT JOIN activity pa ON pa.username_key = w.username_key
    `),
    pool.query(`
      WITH whitelist_players AS (
        SELECT DISTINCT ON (LOWER(username))
          LOWER(username) AS username_key,
          username
        FROM whitelist
        ORDER BY LOWER(username), id
      ),
      activity AS (
        SELECT DISTINCT ON (LOWER(username))
          LOWER(username) AS username_key,
          last_seen,
          is_online
        FROM player_activity
        ORDER BY LOWER(username), is_online DESC, COALESCE(last_seen, last_online) DESC NULLS LAST, id DESC
      ),
      playtime AS (
        SELECT
          LOWER(username) AS username_key,
          SUM(total_seconds)::BIGINT AS total_seconds,
          MIN(tracking_since) FILTER (WHERE tracking_since IS NOT NULL) AS tracking_since
        FROM player_playtime
        GROUP BY LOWER(username)
      )
      SELECT
        w.username,
        COALESCE(pa.is_online, FALSE) AS is_online,
        pa.last_seen,
        COALESCE(pt.total_seconds, 0) +
          CASE WHEN pt.tracking_since IS NULL THEN 0
               ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - pt.tracking_since)))::BIGINT)
          END AS total_seconds
      FROM whitelist_players w
      LEFT JOIN activity pa ON pa.username_key = w.username_key
      LEFT JOIN playtime pt ON pt.username_key = w.username_key
      ORDER BY total_seconds DESC, w.username_key
    `),
    pool.query(`
      SELECT
        COUNT(DISTINCT LOWER(username)) FILTER (WHERE last_seen >= NOW() - INTERVAL '24 hours')::int AS seen_24h,
        COUNT(DISTINCT LOWER(username)) FILTER (WHERE last_seen >= NOW() - INTERVAL '7 days')::int AS seen_7d
      FROM player_activity
    `),
    pool.query(`
      WITH activity AS (
        SELECT DISTINCT ON (LOWER(username))
          LOWER(username) AS username_key,
          username,
          is_online
        FROM player_activity
        ORDER BY LOWER(username), is_online DESC, COALESCE(last_seen, last_online) DESC NULLS LAST, id DESC
      )
      SELECT COUNT(*)::int AS total
      FROM activity pa
      WHERE pa.is_online = TRUE
        AND NOT EXISTS (
          SELECT 1 FROM whitelist w WHERE LOWER(w.username) = pa.username_key
        )
    `),
    pool.query(`
      WITH buckets AS (
        SELECT generate_series(
          date_trunc('hour', NOW() - INTERVAL '167 hours'),
          date_trunc('hour', NOW()),
          INTERVAL '1 hour'
        ) AS bucket
      ),
      activity AS (
        SELECT DISTINCT ON (LOWER(username))
          LOWER(username) AS username_key,
          username,
          last_seen,
          is_online
        FROM player_activity
        WHERE last_seen IS NOT NULL
        ORDER BY LOWER(username), is_online DESC, COALESCE(last_seen, last_online) DESC NULLS LAST, id DESC
      )
      SELECT TO_CHAR(buckets.bucket, 'MM-DD HH24:00') AS label,
             buckets.bucket AS bucket,
             COUNT(activity.username)::int AS total
      FROM buckets
      LEFT JOIN activity
        ON (
          (buckets.bucket = date_trunc('hour', NOW()) AND activity.is_online = TRUE)
          OR (
            buckets.bucket < date_trunc('hour', NOW())
            AND activity.last_seen >= buckets.bucket
            AND activity.last_seen < buckets.bucket + INTERVAL '1 hour'
          )
        )
       AND NOT EXISTS (
         SELECT 1 FROM whitelist w WHERE LOWER(w.username) = activity.username_key
       )
      GROUP BY buckets.bucket
      ORDER BY buckets.bucket
    `),
    pool.query(`
      WITH whitelist_players AS (
        SELECT DISTINCT ON (LOWER(username))
          LOWER(username) AS username_key,
          username
        FROM whitelist
        ORDER BY LOWER(username), id
      ),
      activity AS (
        SELECT DISTINCT ON (LOWER(username))
          LOWER(username) AS username_key,
          registration_at
        FROM player_activity
        WHERE registration_at IS NOT NULL
        ORDER BY LOWER(username), registration_at ASC NULLS LAST, id
      )
      SELECT w.username, activity.registration_at
      FROM whitelist_players w
      JOIN activity ON activity.username_key = w.username_key
      WHERE activity.registration_at IS NOT NULL
    `)
  ]);

  const totals = playersResult.rows[0] || {};
  const activityTotals = activityTotalsResult.rows[0] || {};
  const onlineUnwhitelisted = onlineUnwhitelistedResult.rows[0] || {};

  return {
    players: {
      total: toInt(totals.total),
      online: toInt(totals.online),
      offline: toInt(totals.offline),
      onlineUnwhitelisted: toInt(onlineUnwhitelisted.total),
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
    hourlyUnwhitelisted: hourlyUnwhitelistedResult.rows.map(row => ({
      label: row.label,
      bucket: row.bucket,
      value: toInt(row.total)
    })),
    milestones: buildPlayerMilestones(milestoneResult.rows)
  };
}

async function getObsidianStats() {
  assertDatabase();
  const settingsResult = await pool.query(`SELECT timezone, daily_report_enabled, daily_report_hour FROM obsidian_farm_analytics_settings WHERE id=1`);
  const settings = settingsResult.rows[0] || {
    timezone: process.env.OBSIDIAN_ANALYTICS_TIMEZONE || 'Europe/Vilnius',
    daily_report_enabled: process.env.OBSIDIAN_DAILY_REPORT_ENABLED !== 'false',
    daily_report_hour: process.env.OBSIDIAN_DAILY_REPORT_HOUR == null ? 9 : Number(process.env.OBSIDIAN_DAILY_REPORT_HOUR)
  };
  const timezone = settings.timezone || 'Europe/Vilnius';
  const [farmResult, todayResult, dailyResult, hourlyResult, supplyResult, supplyHistoryResult, annotationsResult, goalsResult, tpsResult, comparisonResult, toolUsageResult] = await Promise.all([
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
      WHERE farm_date = (NOW() AT TIME ZONE $1)::date
    `, [timezone]),
    pool.query(`
      WITH dates AS (
        SELECT generate_series(
          (NOW() AT TIME ZONE $1)::date - 89,
          (NOW() AT TIME ZONE $1)::date,
          INTERVAL '1 day'
        )::date AS farm_date
      )
      SELECT TO_CHAR(dates.farm_date, 'MM-DD') AS label,
             dates.farm_date::text AS bucket,
             COALESCE(stats.mined, 0)::bigint AS mined
      FROM dates
      LEFT JOIN obsidian_farm_daily stats USING (farm_date)
      ORDER BY dates.farm_date
    `, [timezone]),
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
             COALESCE(stats.mined, 0)::bigint AS mined,
             (stats.bucket IS NOT NULL) AS observed
      FROM buckets
      LEFT JOIN obsidian_farm_hourly stats USING (bucket)
      ORDER BY buckets.bucket
    `),
    pool.query(`
      SELECT supplies, observed_at, updated_at
      FROM obsidian_farm_supply_snapshot
      WHERE id = 1
    `),
    pool.query(`SELECT supplies, observed_at FROM obsidian_farm_supply_history WHERE observed_at >= NOW() - INTERVAL '7 days' ORDER BY observed_at`),
    pool.query(`SELECT id,event_type,title,details,occurred_at FROM obsidian_farm_annotations WHERE occurred_at >= NOW() - INTERVAL '90 days' ORDER BY occurred_at`),
    pool.query(`SELECT id,name,target_total,active,created_at,reached_at FROM obsidian_farm_goals ORDER BY active DESC,created_at DESC`),
    pool.query(`SELECT sampled_at,tps FROM bot_tps_samples WHERE sampled_at >= NOW() - INTERVAL '7 days' ORDER BY sampled_at`),
    pool.query(`SELECT
      COALESCE(SUM(mined) FILTER (WHERE farm_date=(NOW() AT TIME ZONE $1)::date),0)::bigint AS today,
      COALESCE(SUM(mined) FILTER (WHERE farm_date=(NOW() AT TIME ZONE $1)::date-1),0)::bigint AS yesterday,
      COALESCE((SELECT SUM(h.mined) FROM obsidian_farm_hourly h
        WHERE h.bucket >= (((NOW() AT TIME ZONE $1)::date - 1)::timestamp AT TIME ZONE $1)
          AND h.bucket < NOW() - INTERVAL '1 day'),0)::bigint AS yesterday_comparable,
      COALESCE(SUM(mined) FILTER (WHERE farm_date BETWEEN (NOW() AT TIME ZONE $1)::date-6 AND (NOW() AT TIME ZONE $1)::date),0)::bigint AS week,
      COALESCE(SUM(mined) FILTER (WHERE farm_date BETWEEN (NOW() AT TIME ZONE $1)::date-13 AND (NOW() AT TIME ZONE $1)::date-7),0)::bigint AS previous_week
      FROM obsidian_farm_daily`, [timezone]),
    pool.query(`SELECT tool_name,blocks_mined,durability_used,remaining_percent,changed_at FROM obsidian_farm_tool_usage WHERE changed_at >= NOW()-INTERVAL '90 days' ORDER BY changed_at`)
  ]);

  const farm = compactFarmState(farmResult.rows[0] || {});
  const hourly = hourlyResult.rows.map(row => ({
    label: row.label,
    bucket: row.bucket,
    value: toInt(row.mined),
    observed: Boolean(row.observed)
  }));
  const daily = dailyResult.rows.map(row => ({
    label: row.label,
    bucket: row.bucket,
    value: toInt(row.mined)
  }));
  const last7Days = daily.slice(-7).reduce((sum, item) => sum + item.value, 0);

  const supplies = normalizeSupplySnapshot(supplyResult.rows[0]);
  const goals = goalsResult.rows.map(row => ({ id: row.id, name: row.name, targetTotal: toInt(row.target_total), active: row.active, createdAt: row.created_at, reachedAt: row.reached_at }));
  const annotations = annotationsResult.rows.map(row => ({ id: row.id, eventType: row.event_type, title: row.title, details: row.details, occurredAt: row.occurred_at }));
  const comparison = comparisonResult.rows[0] || {};
  const farmPayload = { ...farm, todayMined: toInt(todayResult.rows[0]?.mined), last7Days };
  return {
    farm: {
      ...farmPayload
    },
    hourly,
    daily,
    supplies,
    settings: { timezone, dailyReportEnabled: settings.daily_report_enabled, dailyReportHour: settings.daily_report_hour },
    goals,
    annotations,
    analytics: calculateAnalytics({ farm: farmPayload, hourly, supplies, goals, annotations,
      supplyHistory: supplyHistoryResult.rows, toolUsage: toolUsageResult.rows, tps: tpsResult.rows,
      comparison: { today: comparison.today, yesterdayComparable: comparison.yesterday_comparable, yesterday: comparison.yesterday, week: comparison.week, previousWeek: comparison.previous_week } })
  };
}

async function updateObsidianAnalytics(currentUser, body) {
  assertAdminUser(currentUser);
  if (body.action === 'goal') {
    const name = String(body.name || '').trim().slice(0, 120);
    const target = Math.trunc(Number(body.targetTotal));
    if (!name || !Number.isSafeInteger(target) || target <= 0) throw Object.assign(new Error('Goal name and positive target are required.'), { statusCode: 400 });
    await pool.query(`INSERT INTO obsidian_farm_goals(name,target_total,created_by) VALUES($1,$2,$3)`, [name, target, currentUser.id]);
    await pool.query(`INSERT INTO obsidian_farm_annotations(event_type,title,details) VALUES('settings_changed','Production goal changed',$1::jsonb)`, [JSON.stringify({ name, targetTotal: target, actor: currentUser.username })]);
    await recordSystemLog({ level: 'audit', category: 'obsidian_analytics', actor: currentUser.username, message: `Created obsidian goal ${name}.`, details: { targetTotal: target } });
  } else if (body.action === 'goal_state') {
    await pool.query(`UPDATE obsidian_farm_goals SET active=$1,updated_at=NOW() WHERE id=$2`, [Boolean(body.active), body.id]);
    await pool.query(`INSERT INTO obsidian_farm_annotations(event_type,title,details) VALUES('settings_changed','Production goal state changed',$1::jsonb)`, [JSON.stringify({ id: body.id, active: Boolean(body.active), actor: currentUser.username })]);
    await recordSystemLog({ level: 'audit', category: 'obsidian_analytics', actor: currentUser.username, message: 'Changed obsidian goal state.', details: { id: body.id, active: Boolean(body.active) } });
  } else if (body.action === 'goal_delete') {
    const id = Number(body.id);
    if (!Number.isSafeInteger(id)) throw Object.assign(new Error('Invalid goal id.'), { statusCode: 400 });
    const deleted = await pool.query(`DELETE FROM obsidian_farm_goals WHERE id=$1 RETURNING id,name,target_total,active`, [id]);
    if (!deleted.rowCount) throw Object.assign(new Error('Production goal not found.'), { statusCode: 404 });
    const goal = deleted.rows[0];
    await pool.query(`INSERT INTO obsidian_farm_annotations(event_type,title,details) VALUES('settings_changed','Production goal deleted',$1::jsonb)`, [JSON.stringify({ id, name: goal.name, targetTotal: String(goal.target_total), actor: currentUser.username })]);
    await recordSystemLog({ level: 'audit', category: 'obsidian_analytics', actor: currentUser.username, message: `Deleted obsidian goal ${goal.name}.`, details: { id, targetTotal: String(goal.target_total), wasActive: goal.active } });
  } else if (body.action === 'settings') {
    const timezone = String(body.timezone || 'Europe/Vilnius');
    try { new Intl.DateTimeFormat('en', { timeZone: timezone }).format(); } catch (_) { throw Object.assign(new Error('Invalid timezone.'), { statusCode: 400 }); }
    const hour = Math.max(0, Math.min(23, Math.trunc(Number(body.dailyReportHour))));
    await pool.query(`INSERT INTO obsidian_farm_analytics_settings(id,timezone,daily_report_enabled,daily_report_hour,updated_at)
      VALUES(1,$1,$2,$3,NOW()) ON CONFLICT(id) DO UPDATE SET timezone=EXCLUDED.timezone,daily_report_enabled=EXCLUDED.daily_report_enabled,daily_report_hour=EXCLUDED.daily_report_hour,updated_at=NOW()`, [timezone, Boolean(body.dailyReportEnabled), hour]);
    await pool.query(`INSERT INTO obsidian_farm_annotations(event_type,title,details) VALUES('settings_changed','Analytics settings changed',$1::jsonb)`, [JSON.stringify({ timezone, dailyReportHour: hour, actor: currentUser.username })]);
    await recordSystemLog({ level: 'audit', category: 'obsidian_analytics', actor: currentUser.username, message: 'Updated obsidian analytics settings.', details: { timezone, dailyReportEnabled: Boolean(body.dailyReportEnabled), dailyReportHour: hour } });
  } else throw Object.assign(new Error('Unknown analytics action.'), { statusCode: 400 });
  return getObsidianStats();
}

async function exportObsidianCsv(res, url) {
  const from = url.searchParams.get('from') || '1970-01-01';
  const to = url.searchParams.get('to') || '2999-12-31';
  const result = await pool.query(`SELECT h.bucket,h.mined,
    (SELECT ROUND(AVG(t.tps)::numeric,2) FROM bot_tps_samples t WHERE t.sampled_at>=h.bucket AND t.sampled_at<h.bucket+INTERVAL '1 hour') AS avg_tps,
    (SELECT string_agg(a.event_type,'|') FROM obsidian_farm_annotations a WHERE a.occurred_at>=h.bucket AND a.occurred_at<h.bucket+INTERVAL '1 hour') AS annotations
    FROM obsidian_farm_hourly h WHERE h.bucket >= $1::timestamptz AND h.bucket < $2::timestamptz + INTERVAL '1 day' ORDER BY h.bucket`, [from, to]);
  sendCsv(res, 'obsidian-farm.csv', [['timestamp','mined','average_tps','annotations'], ...result.rows.map(row => [row.bucket.toISOString(),row.mined,row.avg_tps,row.annotations])]);
}

async function getServerStats() {
  assertDatabase();

  const [tpsSummaryResult, hourlyTpsResult, nearbyResult, playerStats] = await Promise.all([
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
      LIMIT 5
    `),
    getPlayerStats()
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
    playerStats
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
    activity AS (
      SELECT DISTINCT ON (LOWER(username))
        LOWER(username) AS username_key,
        username,
        last_seen,
        last_online,
        is_online
      FROM player_activity
      ORDER BY LOWER(username), is_online DESC, COALESCE(last_seen, last_online) DESC NULLS LAST, id DESC
    ),
    matched AS (
      SELECT
        names.username,
        EXISTS (
          SELECT 1 FROM whitelist w WHERE LOWER(w.username) = LOWER(names.username)
        ) AS is_whitelisted,
        pa.last_seen,
        pa.last_online,
        COALESCE(pa.is_online, FALSE) AS is_online,
        COALESCE(pt.total_seconds, 0) +
          CASE WHEN pt.tracking_since IS NULL THEN 0
               ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - pt.tracking_since)))::BIGINT)
          END AS total_seconds
      FROM names
      LEFT JOIN activity pa ON pa.username_key = LOWER(names.username)
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

  const [profileResult, chatResult, recentChatResult, nearbyResult, ignoredResult] = await Promise.all([
    pool.query(`
      WITH names AS (
        SELECT username, 0 AS priority FROM whitelist WHERE LOWER(username) = LOWER($1)
        UNION
        SELECT username, 1 AS priority FROM player_playtime WHERE LOWER(username) = LOWER($1)
        UNION
        SELECT username, 2 AS priority FROM player_activity WHERE LOWER(username) = LOWER($1)
      ),
      selected AS (
        SELECT COALESCE((
          SELECT username
          FROM names
          ORDER BY priority, CASE WHEN username = $1 THEN 0 ELSE 1 END, username
          LIMIT 1
        ), $1) AS username
      ),
      activity AS (
        SELECT DISTINCT ON (LOWER(username))
          LOWER(username) AS username_key,
          username,
          last_seen,
          last_online,
          registration_at,
          is_online
        FROM player_activity
        WHERE LOWER(username) = LOWER($1)
        ORDER BY LOWER(username), is_online DESC, COALESCE(last_seen, last_online) DESC NULLS LAST, id DESC
      )
      SELECT
        selected.username,
        EXISTS (
          SELECT 1 FROM whitelist w WHERE LOWER(w.username) = LOWER(selected.username)
        ) AS is_whitelisted,
        pa.last_seen,
        pa.last_online,
        pa.registration_at,
        TO_CHAR(pa.registration_at AT TIME ZONE 'UTC', 'MM/DD/YYYY HH24:MI:SS') AS registration_display,
        pt.tracking_since,
        COALESCE(pa.is_online, FALSE) AS is_online,
        COALESCE(pt.total_seconds, 0) +
          CASE WHEN pt.tracking_since IS NULL THEN 0
               ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - pt.tracking_since)))::BIGINT)
          END AS total_seconds
      FROM selected
      LEFT JOIN activity pa ON pa.username_key = LOWER(selected.username)
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
    `, [username]),
    pool.query(`
      SELECT EXISTS (
        SELECT 1
        FROM ignored_users
        WHERE LOWER(username) = LOWER($1)
      ) AS is_ignored
    `, [username])
  ]);

  const profile = profileResult.rows[0] || { username };
  const chat = chatResult.rows[0] || {};
  const nearby = nearbyResult.rows[0] || null;
  const seconds = toInt(profile.total_seconds);

  return {
    username: profile.username || username,
    isWhitelisted: Boolean(profile.is_whitelisted),
    isIgnored: Boolean(ignoredResult.rows[0]?.is_ignored),
    isOnline: Boolean(profile.is_online),
    trackingSince: profile.tracking_since || null,
    lastSeen: profile.last_seen || null,
    lastOnline: profile.last_online || null,
    registrationAt: profile.registration_at || null,
    registrationDisplay: profile.registration_display || null,
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
    await recordSystemLog({ level: 'info', category: 'auth', message: 'User logged out.' });
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
    await recordSystemLog({
      level: isAdmin ? 'audit' : 'info',
      category: 'auth',
      actor: username,
      message: isAdmin ? 'Primary admin account registered.' : 'New site registration is waiting for approval.',
      details: { username, role, status }
    });

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
    await recordSystemLog({
      level: 'info',
      category: 'auth',
      actor: user.username,
      message: 'User logged in.',
      details: { role: user.role }
    });
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

function assertAdminUser(currentUser) {
  if (currentUser.role !== 'admin') {
    const err = new Error('Admin access required.');
    err.statusCode = 403;
    throw err;
  }
}

async function updateAdminUser(currentUser, body) {
  assertAdminUser(currentUser);
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

  await recordSystemLog({
    level: 'audit',
    category: 'admin_users',
    actor: currentUser.username,
    message: `Admin user action: ${action}`,
    details: { targetUsername: username, action }
  });

  return getAdminUsers(currentUser);
}

async function queueAdminBotCommand(currentUser, body) {
  assertAdminUser(currentUser);

  const commandType = String(body.commandType || body.command_type || '').trim().toLowerCase();
  const allowed = new Set([
    'pause',
    'resume',
    'follow',
    'follow_stop',
    'drop_item',
    'whitelist_add',
    'whitelist_remove',
    'ignore_chat',
    'unignore_chat',
    'obsidian_toggle',
    'obsidian_radius_toggle',
    'obsidian_reset_coordinates',
    'obsidian_set_coordinates',
    'child_toggle',
    'child_say',
    'gemini_toggle',
    'child_public_toggle'
  ]);
  if (!allowed.has(commandType)) {
    const err = new Error('Unsupported bot command.');
    err.statusCode = 400;
    throw err;
  }

  const payload = body.payload && typeof body.payload === 'object' ? { ...body.payload } : {};
  if (commandType === 'pause') {
    const minutes = Number(body.minutes);
    if (Number.isFinite(minutes) && minutes > 0) {
      payload.minutes = Math.min(1440, Math.floor(minutes));
    }
  }

  return queueBotCommand(currentUser, commandType, payload);
}

async function setAdminPlaytime(currentUser, body) {
  assertAdminUser(currentUser);
  assertDatabase();

  const rawLine = String(body.line || '').trim();
  const match = rawLine.match(/^([A-Za-z0-9_]{1,32})\s*:\s*([\s\S]+)$/);
  if (!match) {
    const err = new Error('Use format: WheatMagnate: 402 Days, 3 Hours, 19 Minutes');
    err.statusCode = 400;
    throw err;
  }

  const username = match[1];
  const totalSeconds = parsePlaytimeSeconds(match[2]);
  if (totalSeconds == null) {
    const err = new Error('Could not parse playtime duration.');
    err.statusCode = 400;
    throw err;
  }

  const result = await pool.query(`
    INSERT INTO player_playtime (username, total_seconds)
    VALUES ($1, $2)
    ON CONFLICT (LOWER(username))
    DO UPDATE SET username = EXCLUDED.username,
                  total_seconds = EXCLUDED.total_seconds,
                  tracking_since = CASE WHEN player_playtime.tracking_since IS NULL THEN NULL ELSE NOW() END,
                  updated_at = NOW()
    RETURNING username
  `, [username, totalSeconds]);
  await recordSystemLog({
    level: 'audit',
    category: 'admin_data',
    actor: currentUser.username,
    message: `Updated playtime for ${username}.`,
    details: { username, totalSeconds }
  });

  return {
    username: result.rows[0]?.username || username,
    totalSeconds,
    playtime: formatSeconds(totalSeconds)
  };
}

async function setAdminRegistrationDate(currentUser, body) {
  assertAdminUser(currentUser);
  assertDatabase();

  const rawLine = String(body.line || '').trim();
  const match = rawLine.match(/^([A-Za-z0-9_]{1,32})\s*:\s*([\s\S]+)$/);
  if (!match) {
    const err = new Error('Use format: WheatMagnate: 01/31/2025 15:40:15');
    err.statusCode = 400;
    throw err;
  }

  const username = match[1];
  const registrationDate = parseRegistrationDate(match[2]);
  if (!registrationDate) {
    const err = new Error('Could not parse registration date.');
    err.statusCode = 400;
    throw err;
  }

  const result = await pool.query(`
    WITH updated AS (
      UPDATE player_activity
      SET registration_at = $2
      WHERE id = (
        SELECT id
        FROM player_activity
        WHERE LOWER(username) = LOWER($1)
        ORDER BY is_online DESC, COALESCE(last_seen, last_online) DESC NULLS LAST, id DESC
        LIMIT 1
      )
      RETURNING username, registration_at
    ),
    inserted AS (
      INSERT INTO player_activity (username, registration_at)
      SELECT $1, $2
      WHERE NOT EXISTS (SELECT 1 FROM updated)
      RETURNING username, registration_at
    )
    SELECT username,
           TO_CHAR(registration_at AT TIME ZONE 'UTC', 'MM/DD/YYYY HH24:MI:SS') AS registration_display
    FROM updated
    UNION ALL
    SELECT username,
           TO_CHAR(registration_at AT TIME ZONE 'UTC', 'MM/DD/YYYY HH24:MI:SS') AS registration_display
    FROM inserted
  `, [username, registrationDate]);
  await recordSystemLog({
    level: 'audit',
    category: 'admin_data',
    actor: currentUser.username,
    message: `Updated registration date for ${username}.`,
    details: { username, registrationAt: registrationDate.toISOString() }
  });

  return {
    username: result.rows[0]?.username || username,
    registrationAt: registrationDate,
    registrationDisplay: result.rows[0]?.registration_display || match[2]
  };
}

function commandLogLevel(status, error) {
  if (error || status === 'failed') return 'error';
  if (status === 'pending' || status === 'running') return 'info';
  return 'audit';
}

async function getAdminSystemLogs(currentUser, url) {
  assertAdminUser(currentUser);
  const limit = Math.min(300, Math.max(20, toInt(url.searchParams.get('limit'), 120)));
  const level = String(url.searchParams.get('level') || 'all').toLowerCase();
  const allowedLevels = new Set(['debug', 'info', 'warn', 'error', 'audit']);
  const useLevelFilter = allowedLevels.has(level);

  const logsQuery = useLevelFilter
    ? pool.query(`
        SELECT id::text, level, category, actor_username, message, details, created_at
        FROM site_system_logs
        WHERE level = $1
          AND NOT (
            category = 'bot_console'
            AND (message LIKE '[PlayerJoined]%' OR message LIKE '[PlayerLeft]%')
          )
        ORDER BY created_at DESC
        LIMIT $2
      `, [level, limit])
    : pool.query(`
        SELECT id::text, level, category, actor_username, message, details, created_at
        FROM site_system_logs
        WHERE NOT (
          category = 'bot_console'
          AND (message LIKE '[PlayerJoined]%' OR message LIKE '[PlayerLeft]%')
        )
        ORDER BY created_at DESC
        LIMIT $1
      `, [limit]);

  const commandsQuery = pool.query(`
    SELECT id::text, source, requested_by, command_type, payload, status, error, created_at, finished_at
    FROM bot_commands
    ORDER BY created_at DESC
    LIMIT $1
  `, [limit]);

  const [logsResult, commandsResult] = await Promise.all([logsQuery, commandsQuery]);
  const logs = logsResult.rows.map(row => ({
    id: `log-${row.id}`,
    kind: 'system',
    level: row.level,
    category: row.category,
    actor: row.actor_username,
    message: row.message,
    details: row.details,
    createdAt: row.created_at
  }));
  const commands = commandsResult.rows
    .map(row => ({
      id: `command-${row.id}`,
      kind: 'command',
      level: commandLogLevel(row.status, row.error),
      category: 'bot_command',
      actor: row.requested_by,
      message: `Bot command ${row.command_type} is ${row.status}.`,
      details: {
        commandId: row.id,
        source: row.source,
        commandType: row.command_type,
        payload: row.payload,
        error: row.error,
        finishedAt: row.finished_at
      },
      createdAt: row.created_at
    }))
    .filter(row => !useLevelFilter || row.level === level);

  return {
    logs: [...logs, ...commands]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit)
  };
}

async function getAdminControlState(currentUser) {
  assertAdminUser(currentUser);

  const [
    settingsResult,
    botStatusResult,
    whitelistResult,
    ignoredResult,
    onlineResult,
    playerTotalsResult,
    farmStateResult
  ] = await Promise.all([
    pool.query('SELECT key, value FROM admin_settings'),
    pool.query('SELECT status, observed_at FROM bot_status_snapshots WHERE id = 1'),
    pool.query('SELECT username FROM whitelist ORDER BY LOWER(username) ASC'),
    pool.query('SELECT username FROM ignored_users ORDER BY LOWER(username) ASC'),
    pool.query(`
      SELECT username
      FROM player_activity
      WHERE is_online = TRUE
      ORDER BY LOWER(username) ASC
    `),
    pool.query('SELECT COUNT(DISTINCT LOWER(username))::int AS total FROM player_activity'),
    pool.query(`
      SELECT target_x, target_y, target_z, target_radius
      FROM obsidian_farm_state
      WHERE id = 1
    `)
  ]);

  const settings = {};
  for (const row of settingsResult.rows) settings[row.key] = row.value;
  const botStatus = botStatusResult.rows[0]?.status || {};
  const farmState = farmStateResult.rows[0] || {};
  if (farmState.target_x != null && farmState.target_y != null && farmState.target_z != null) {
    botStatus.obsidian = {
      ...(botStatus.obsidian || {}),
      config: {
        ...(botStatus.obsidian?.config || {}),
        x: toInt(farmState.target_x),
        y: toInt(farmState.target_y),
        z: toInt(farmState.target_z),
        maxCauldronDist: farmState.target_radius == null ? 5 : toInt(farmState.target_radius)
      }
    };
  }
  const whitelist = whitelistResult.rows.map(row => row.username);
  const ignoredChatUsers = ignoredResult.rows.map(row => row.username);
  const onlinePlayers = onlineResult.rows.map(row => row.username);

  return {
    settings: {
      whitelistMode: settings.whitelistMode ?? true,
      dangerRadius: settings.dangerRadius ?? 300,
      messageCooldownMs: settings.messageCooldownMs ?? 5000,
      geminiEnabled: settings.geminiEnabled ?? true,
      childPublicSpeech: settings.childPublicSpeech ?? true
    },
    bot: botStatus,
    inventory: Array.isArray(botStatus.inventory) ? botStatus.inventory : [],
    whitelist,
    ignoredChatUsers,
    onlinePlayers,
    playerTotals: {
      allTime: toInt(playerTotalsResult.rows[0]?.total)
    },
    whitelistAddCandidates: onlinePlayers.filter(username =>
      !whitelist.some(entry => entry.toLowerCase() === username.toLowerCase())
    ),
    ignoreCandidates: onlinePlayers.filter(username =>
      !ignoredChatUsers.some(entry => entry.toLowerCase() === username.toLowerCase())
    ),
    nearbyPlayers: Array.isArray(botStatus.nearbyPlayers) ? botStatus.nearbyPlayers : []
  };
}

async function getNotifications(currentUser, url) {
  assertAdminUser(currentUser);
  const status = String(url.searchParams.get('status') || 'all');
  const severity = String(url.searchParams.get('severity') || 'all');
  const eventType = String(url.searchParams.get('eventType') || 'all');
  const unread = url.searchParams.get('unread') === 'true';
  const limit = Math.min(250, Math.max(1, toInt(url.searchParams.get('limit'), 250)));
  const values = [];
  const where = [];
  if (['active', 'resolved'].includes(status)) { values.push(status); where.push(`status=$${values.length}`); }
  if (['info', 'warning', 'critical'].includes(severity)) { values.push(severity); where.push(`severity=$${values.length}`); }
  if (eventType !== 'all') { values.push(eventType.slice(0, 64)); where.push(`event_type=$${values.length}`); }
  if (unread) where.push('read_at IS NULL');
  values.push(limit);
  const result = await pool.query(`
    SELECT id::text, event_type, dedup_key, severity, status, title, message, metadata,
           occurrence_count, first_triggered_at, last_triggered_at, resolved_at, read_at, created_at
    FROM notifications ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, created_at DESC LIMIT $${values.length}
  `, values);
  const unreadResult = await pool.query('SELECT COUNT(*)::int AS count FROM notifications WHERE read_at IS NULL');
  return {
    notifications: result.rows.map(row => ({
      id: row.id, eventType: row.event_type, dedupKey: row.dedup_key, severity: row.severity,
      status: row.status, title: row.title, message: row.message, metadata: row.metadata,
      occurrenceCount: row.occurrence_count, firstTriggeredAt: row.first_triggered_at,
      lastTriggeredAt: row.last_triggered_at, resolvedAt: row.resolved_at,
      readAt: row.read_at, createdAt: row.created_at
    })),
    unreadCount: unreadResult.rows[0]?.count || 0,
    viewer: currentUser.username
  };
}

async function markNotificationsRead(currentUser, body) {
  assertAdminUser(currentUser);
  const ids = Array.isArray(body.ids) ? body.ids.map(value => Number(value)).filter(Number.isSafeInteger) : [];
  if (body.all === true) {
    await pool.query('UPDATE notifications SET read_at=COALESCE(read_at,NOW()), read_by=COALESCE(read_by,$1) WHERE read_at IS NULL', [currentUser.id]);
  } else if (ids.length) {
    await pool.query('UPDATE notifications SET read_at=COALESCE(read_at,NOW()), read_by=COALESCE(read_by,$1) WHERE id=ANY($2::bigint[])', [currentUser.id, ids]);
  }
  const count = await pool.query('SELECT COUNT(*)::int AS count FROM notifications WHERE read_at IS NULL');
  return { ok: true, unreadCount: count.rows[0]?.count || 0 };
}

async function getNotificationRules(currentUser) {
  assertAdminUser(currentUser);
  const result = await pool.query(`
    SELECT event_type, enabled, severity, threshold, cooldown_seconds, delivery_channels,
           last_triggered_at, updated_at FROM notification_rules ORDER BY event_type
  `);
  return { rules: result.rows.map(row => ({
    eventType: row.event_type, enabled: row.enabled, severity: row.severity,
    threshold: row.threshold, cooldownSeconds: row.cooldown_seconds,
    deliveryChannels: row.delivery_channels, lastTriggeredAt: row.last_triggered_at,
    updatedAt: row.updated_at
  })) };
}

async function updateNotificationRule(currentUser, body) {
  assertAdminUser(currentUser);
  const eventType = String(body.eventType || '').trim();
  const severity = String(body.severity || '').trim();
  const cooldownSeconds = Number(body.cooldownSeconds);
  const channels = Array.isArray(body.deliveryChannels) ? [...new Set(body.deliveryChannels.map(String))] : [];
  if (!eventType || !['info', 'warning', 'critical'].includes(severity) ||
      !Number.isInteger(cooldownSeconds) || cooldownSeconds < 0 ||
      channels.length === 0 || channels.some(channel => !['discord', 'site', 'system_log'].includes(channel))) {
    const err = new Error('Invalid notification rule.'); err.statusCode = 400; throw err;
  }
  const threshold = body.threshold && typeof body.threshold === 'object' ? body.threshold : null;
  const updated = await pool.query(`
    UPDATE notification_rules SET enabled=$2, severity=$3, threshold=$4,
      cooldown_seconds=$5, delivery_channels=$6, updated_at=NOW()
    WHERE event_type=$1 RETURNING event_type
  `, [eventType, Boolean(body.enabled), severity, threshold, cooldownSeconds, channels]);
  if (!updated.rowCount) { const err = new Error('Notification rule not found.'); err.statusCode = 404; throw err; }
  await recordSystemLog({
    level: 'audit', category: 'notification_rules', actor: currentUser.username,
    message: `Updated notification rule ${eventType}.`,
    details: { eventType, enabled: Boolean(body.enabled), severity, threshold, cooldownSeconds, deliveryChannels: channels }
  });
  if (['low_pickaxe_durability', 'no_pickaxes', 'low_food', 'farm_stalled', 'low_tps'].includes(eventType)) {
    await pool.query(`INSERT INTO obsidian_farm_annotations(event_type,title,details) VALUES('settings_changed',$1,$2::jsonb)`, [
      `Notification rule changed: ${eventType}`,
      JSON.stringify({ actor: currentUser.username, enabled: Boolean(body.enabled), severity, threshold, cooldownSeconds })
    ]);
  }
  return getNotificationRules(currentUser);
}

async function handleApi(req, res, url) {
  let currentUser = null;
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

    currentUser = await getCurrentUser(req);
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
    if (url.pathname === '/api/admin/control-state' && req.method === 'GET') {
      sendJson(res, 200, await getAdminControlState(currentUser));
      return;
    }
    if (url.pathname === '/api/admin/system-logs' && req.method === 'GET') {
      sendJson(res, 200, await getAdminSystemLogs(currentUser, url));
      return;
    }
    if (url.pathname === '/api/admin/notification-rules' && req.method === 'GET') {
      sendJson(res, 200, await getNotificationRules(currentUser)); return;
    }
    if (url.pathname === '/api/admin/notification-rules' && req.method === 'PUT') {
      sendJson(res, 200, await updateNotificationRule(currentUser, await readJsonBody(req))); return;
    }
    if (url.pathname === '/api/admin/bot-command' && req.method === 'POST') {
      sendJson(res, 202, await queueAdminBotCommand(currentUser, await readJsonBody(req)));
      return;
    }
    if (url.pathname === '/api/admin/playtime' && req.method === 'POST') {
      sendJson(res, 200, await setAdminPlaytime(currentUser, await readJsonBody(req)));
      return;
    }
    if (url.pathname === '/api/admin/registration-date' && req.method === 'POST') {
      sendJson(res, 200, await setAdminRegistrationDate(currentUser, await readJsonBody(req)));
      return;
    }

    if (url.pathname === '/api/summary') {
      sendJson(res, 200, await getSummary());
      return;
    }
    if (url.pathname === '/api/notifications' && req.method === 'GET') {
      sendJson(res, 200, await getNotifications(currentUser, url)); return;
    }
    if (url.pathname === '/api/notifications/read' && req.method === 'POST') {
      sendJson(res, 200, await markNotificationsRead(currentUser, await readJsonBody(req))); return;
    }
    if (url.pathname === '/api/players') {
      sendJson(res, 200, await getPlayers());
      return;
    }
    if (url.pathname === '/api/chat') {
      sendJson(res, 200, await getChat(url));
      return;
    }
    if (url.pathname === '/api/chat/version' && req.method === 'GET') {
      const result = await pool.query('SELECT COALESCE(MAX(id),0)::text AS latest_id FROM game_chat_messages');
      sendJson(res, 200, { latestId: result.rows[0]?.latest_id || '0' });
      return;
    }
    if (url.pathname === '/api/chat/send' && req.method === 'POST') {
      sendJson(res, 202, await queueSiteChatMessage(currentUser, await readJsonBody(req)));
      return;
    }
    if (url.pathname === '/api/item-icons') {
      sendJson(res, 200, await getItemIcons());
      return;
    }
    if (url.pathname === '/api/whisper/online' && req.method === 'GET') {
      sendJson(res, 200, await getWhisperOnlinePlayers(currentUser, url));
      return;
    }
    if (url.pathname === '/api/whisper/dialog' && req.method === 'GET') {
      sendJson(res, 200, await getWhisperDialog(currentUser, url));
      return;
    }
    if (url.pathname === '/api/whisper/dialog/delete' && req.method === 'POST') {
      sendJson(res, 200, await deleteWhisperDialog(currentUser, await readJsonBody(req)));
      return;
    }
    if (url.pathname === '/api/whisper/notifications' && req.method === 'GET') {
      sendJson(res, 200, await getWhisperNotifications(currentUser, url));
      return;
    }
    if (url.pathname === '/api/whisper/read' && req.method === 'POST') {
      sendJson(res, 200, await markWhisperRead(currentUser, await readJsonBody(req)));
      return;
    }
    if (url.pathname === '/api/whisper/send' && req.method === 'POST') {
      sendJson(res, 202, await queueSiteWhisperMessage(currentUser, await readJsonBody(req)));
      return;
    }
    if (url.pathname === '/api/bot-stats') {
      sendJson(res, 200, await getBotStats());
      return;
    }
    if (url.pathname === '/api/obsidian') {
      if (req.method === 'GET') sendJson(res, 200, await getObsidianStats());
      else if (req.method === 'POST') sendJson(res, 200, await updateObsidianAnalytics(currentUser, await readJsonBody(req)));
      else sendError(res, 405, 'Method not allowed.');
      return;
    }
    if (url.pathname === '/api/obsidian/export.csv' && req.method === 'GET') {
      await exportObsidianCsv(res, url);
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
    await recordSystemLog({
      level: 'error',
      category: 'api',
      actor: currentUser?.username,
      message: `${req.method} ${url.pathname}: ${err.message || 'Internal server error.'}`,
      details: { statusCode: err.statusCode || 500 }
    });
    sendError(res, err.statusCode || 500, err.message || 'Internal server error.');
  }
}

function serveStatic(req, res, url) {
  const requestPath = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  const isItemPath = requestPath.startsWith('/items/');
  const isFoodPath = requestPath.startsWith('/food/');
  const isLogoPath = requestPath.startsWith('/logos/');
  const staticRoot = isItemPath ? ITEMS_DIR : isFoodPath ? FOOD_DIR : isLogoPath ? LOGOS_DIR : PUBLIC_DIR;
  const staticPath = isItemPath
    ? requestPath.slice('/items/'.length)
    : isFoodPath
      ? requestPath.slice('/food/'.length)
    : isLogoPath
      ? requestPath.slice('/logos/'.length)
      : requestPath;
  const filePath = path.normalize(path.join(staticRoot, staticPath));

  if (!filePath.startsWith(staticRoot)) {
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
  if (url.pathname === '/api/events' && req.method === 'GET') {
    handleSseRequest({ req, res, getCurrentUser, hub: sseHub }).catch(err => {
      if (!res.headersSent) sendError(res, err.statusCode || 500, err.message || 'SSE connection failed.');
      else if (!res.writableEnded) res.end();
    });
    return;
  }
  if (url.pathname.startsWith('/api/')) {
    handleApi(req, res, url);
    return;
  }
  serveStatic(req, res, url);
});

function signature(value) {
  if (value == null) return '';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : String(value);
}

async function pollDatabaseEvents() {
  if (!pool || databaseEventPollRunning) return;
  databaseEventPollRunning = true;
  try {
    const markersResult = await pool.query(`
        SELECT
          (SELECT observed_at FROM bot_status_snapshots WHERE id=1) AS bot_status_at,
          (SELECT COALESCE(MAX(id),0) FROM game_chat_messages) AS chat_id,
          (SELECT COALESCE(MAX(id),0) FROM site_whisper_messages) AS whisper_id,
          GREATEST(
            COALESCE((SELECT updated_at FROM obsidian_farm_state WHERE id=1), '-infinity'::timestamptz),
            COALESCE((SELECT updated_at FROM obsidian_farm_supply_snapshot WHERE id=1), '-infinity'::timestamptz),
            COALESCE((SELECT MAX(occurred_at) FROM obsidian_farm_annotations), '-infinity'::timestamptz),
            COALESCE((SELECT MAX(updated_at) FROM obsidian_farm_goals), '-infinity'::timestamptz),
            COALESCE((SELECT updated_at FROM obsidian_farm_analytics_settings WHERE id=1), '-infinity'::timestamptz)
          ) AS farm_status_at,
          (SELECT COALESCE(MAX(id),0) FROM notifications) AS notification_id,
          GREATEST(
            COALESCE((SELECT MAX(updated_at) FROM admin_settings), '-infinity'::timestamptz),
            COALESCE((SELECT MAX(COALESCE(finished_at,started_at,created_at)) FROM bot_commands), '-infinity'::timestamptz),
            COALESCE((SELECT MAX(updated_at) FROM notification_rules), '-infinity'::timestamptz)
          ) AS admin_control_at,
          COALESCE(
            (SELECT JSONB_AGG(username ORDER BY LOWER(username)) FROM player_activity WHERE is_online=TRUE),
            '[]'::jsonb
          ) AS online_players
      `);
    lastDatabaseEventErrorAt = 0;
    const row = markersResult.rows[0] || {};
    const next = {
      botStatusAt: signature(row.bot_status_at), chatId: String(row.chat_id || 0),
      whisperId: String(row.whisper_id || 0), farmStatusAt: signature(row.farm_status_at),
      notificationId: String(row.notification_id || 0), adminControlAt: signature(row.admin_control_at),
      players: new Map((Array.isArray(row.online_players) ? row.online_players : []).map(username => [username.toLowerCase(), username]))
    };
    if (!databaseEventState) {
      databaseEventState = next;
      return;
    }
    const previous = databaseEventState;
    databaseEventState = next;

    if (next.botStatusAt !== previous.botStatusAt) {
      sseHub.publish('bot_status_updated', { observedAt: next.botStatusAt });
      sseHub.publish('admin_control_updated', { source: 'bot_status', updatedAt: next.botStatusAt }, { roles: ['admin'] });
    }
    for (const [key, username] of next.players) {
      if (!previous.players.has(key)) sseHub.publish('player_joined', { username });
    }
    for (const [key, username] of previous.players) {
      if (!next.players.has(key)) sseHub.publish('player_left', { username });
    }
    if (next.chatId !== previous.chatId) {
      const messages = await pool.query(`SELECT id::text, created_at FROM game_chat_messages WHERE id>$1 ORDER BY id ASC LIMIT 100`, [previous.chatId]);
      for (const message of messages.rows) sseHub.publish('chat_message', { id: message.id, createdAt: message.created_at });
    }
    if (next.whisperId !== previous.whisperId) {
      const messages = await pool.query(`SELECT id::text, site_username, player_username, direction, created_at FROM site_whisper_messages WHERE id>$1 ORDER BY id ASC LIMIT 100`, [previous.whisperId]);
      for (const message of messages.rows) {
        sseHub.publish('whisper_message', {
          id: message.id, playerUsername: message.player_username,
          direction: message.direction, createdAt: message.created_at
        }, { usernames: [message.site_username] });
      }
    }
    if (next.farmStatusAt !== previous.farmStatusAt) {
      sseHub.publish('farm_status_updated', { updatedAt: next.farmStatusAt });
    }
    if (next.notificationId !== previous.notificationId) {
      sseHub.publish('notification_created', { id: next.notificationId }, { roles: ['admin'] });
    }
    if (next.adminControlAt !== previous.adminControlAt) {
      sseHub.publish('admin_control_updated', { source: 'admin', updatedAt: next.adminControlAt }, { roles: ['admin'] });
    }
  } catch (err) {
    if (!lastDatabaseEventErrorAt || Date.now() - lastDatabaseEventErrorAt >= 30_000) {
      lastDatabaseEventErrorAt = Date.now();
      console.error('[SSE] Database event poll failed:', err.message);
    }
  } finally {
    databaseEventPollRunning = false;
  }
}

function startDatabaseEventPoller() {
  if (!pool || databaseEventTimer) return;
  pollDatabaseEvents();
  const intervalMs = Math.min(10_000, Math.max(100, Number(process.env.SSE_DATABASE_POLL_MS) || 250));
  databaseEventTimer = setInterval(pollDatabaseEvents, intervalMs);
  databaseEventTimer.unref?.();
}

ensureOptionalTables()
  .catch(err => {
    console.error('[Site] Failed to ensure optional tables:', err.message);
  })
  .finally(() => {
    server.listen(PORT, () => {
      console.log(`[Site] WheatMagnateBot site: http://localhost:${PORT}`);
      console.log(`[Site] Static files: ${pathToFileURL(PUBLIC_DIR).href}`);
      recordSystemLog({
        level: 'info',
        category: 'site',
        message: `Site server started on port ${PORT}.`
      });
      sseHub.start();
      startDatabaseEventPoller();
    });
  });

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  if (databaseEventTimer) clearInterval(databaseEventTimer);
  databaseEventTimer = null;
  sseHub.stop();
  await new Promise(resolve => server.close(resolve));
  if (pool) await pool.end().catch(() => {});
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
