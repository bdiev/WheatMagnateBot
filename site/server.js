'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { Pool } = require('pg');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const PORT = Number(process.env.SITE_PORT || process.env.PORT) || 3080;
const PUBLIC_DIR = path.join(__dirname, 'public');
const CONFIG_DIR = path.join(__dirname, 'data');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.local.json');

let pool = null;
let databaseSource = null;

function loadLocalConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (_) {
    return {};
  }
}

function saveLocalConfig(config) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function getInitialDatabaseUrl() {
  const localConfig = loadLocalConfig();
  if (localConfig.databaseUrl) {
    databaseSource = 'site config';
    return localConfig.databaseUrl;
  }
  if (process.env.DATABASE_URL) {
    databaseSource = 'environment';
    return process.env.DATABASE_URL;
  }
  return null;
}

function createPool(databaseUrl) {
  return databaseUrl
    ? new Pool({ connectionString: databaseUrl })
    : null;
}

pool = createPool(getInitialDatabaseUrl());

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

function readJsonBody(req, maxBytes = 100_000) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (Buffer.byteLength(body) > maxBytes) {
        reject(new Error('Request body is too large.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!body.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (_) {
        reject(new Error('Invalid JSON body.'));
      }
    });
    req.on('error', reject);
  });
}

function assertDatabase() {
  if (!pool) {
    const err = new Error('Database URL is not configured. Paste it in the site settings.');
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
}

async function configureDatabaseUrl(databaseUrl) {
  const safeUrl = String(databaseUrl || '').trim();
  if (!safeUrl) {
    const err = new Error('Database URL is required.');
    err.statusCode = 400;
    throw err;
  }

  let parsed;
  try {
    parsed = new URL(safeUrl);
  } catch (_) {
    const err = new Error('Database URL is not a valid URL.');
    err.statusCode = 400;
    throw err;
  }

  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    const err = new Error('Only PostgreSQL URLs are supported.');
    err.statusCode = 400;
    throw err;
  }

  const nextPool = createPool(safeUrl);
  try {
    await nextPool.query('SELECT 1');
  } catch (err) {
    await nextPool.end().catch(() => {});
    const wrapped = new Error(`Could not connect to database: ${err.message}`);
    wrapped.statusCode = 400;
    throw wrapped;
  }

  const previousPool = pool;
  const previousSource = databaseSource;
  pool = nextPool;
  databaseSource = 'site config';

  try {
    await ensureOptionalTables();
    saveLocalConfig({ databaseUrl: safeUrl });
  } catch (err) {
    pool = previousPool;
    databaseSource = previousSource;
    await nextPool.end().catch(() => {});
    throw err;
  }

  if (previousPool && previousPool !== nextPool) {
    await previousPool.end().catch(() => {});
  }

  return {
    configured: true,
    source: databaseSource
  };
}

async function getSummary() {
  assertDatabase();

  const [
    players,
    playtime,
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
        COUNT(*) FILTER (WHERE COALESCE(pa.is_online, FALSE))::int AS online
      FROM whitelist w
      LEFT JOIN player_activity pa ON LOWER(pa.username) = LOWER(w.username)
    `),
    pool.query(`
      SELECT
        COALESCE(SUM(
          COALESCE(total_seconds, 0) +
          CASE WHEN tracking_since IS NULL THEN 0
               ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - tracking_since)))::BIGINT)
          END
        ), 0)::bigint AS total_seconds
      FROM player_playtime
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
  const playtimeSeconds = toInt(playtime.rows[0]?.total_seconds);

  return {
    generatedAt: new Date().toISOString(),
    players: {
      total: toInt(playerRow.total),
      online: toInt(playerRow.online)
    },
    playtime: {
      totalSeconds: playtimeSeconds,
      formatted: formatSeconds(playtimeSeconds)
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
      COALESCE(pa.is_online, FALSE) AS is_online,
      COALESCE(pt.total_seconds, 0) +
        CASE WHEN pt.tracking_since IS NULL THEN 0
             ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - pt.tracking_since)))::BIGINT)
        END AS total_seconds
    FROM whitelist w
    LEFT JOIN player_activity pa ON LOWER(pa.username) = LOWER(w.username)
    LEFT JOIN player_playtime pt ON LOWER(pt.username) = LOWER(w.username)
    ORDER BY
      COALESCE(pa.is_online, FALSE) DESC,
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
  const result = await pool.query(`
    SELECT id, username, message, created_at
    FROM game_chat_messages
    ORDER BY created_at DESC
    LIMIT $1
  `, [limit]);

  return {
    messages: result.rows.reverse().map(row => ({
      id: row.id,
      username: row.username,
      message: row.message,
      createdAt: row.created_at
    }))
  };
}

async function handleApi(req, res, url) {
  try {
    if (url.pathname === '/api/health') {
      sendJson(res, 200, { ok: true, database: Boolean(pool), databaseSource });
      return;
    }
    if (url.pathname === '/api/config') {
      sendJson(res, 200, {
        databaseConfigured: Boolean(pool),
        databaseSource
      });
      return;
    }
    if (url.pathname === '/api/config/database-url' && req.method === 'POST') {
      const body = await readJsonBody(req);
      sendJson(res, 200, await configureDatabaseUrl(body.databaseUrl));
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
