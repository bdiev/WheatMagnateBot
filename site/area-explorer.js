'use strict';

// Area Explorer (the OnFocus Meteor addon's explorer module) on the dashboard: the mod uploads
// what it finds - bases, signs, items on the ground, markers (End Portals, Shulker Boxes...) - and its live run status with an API token;
// signed-in users browse the finds and watch the run.

const crypto = require('node:crypto');

const KINDS = Object.freeze(['BASE', 'SIGN', 'ITEM', 'MARKER']);
const SAME_BASE_DISTANCE = 64;
const MAX_FINDS_PER_BATCH = 1000;
const MAX_INGEST_BYTES = 2 * 1024 * 1024;
const MAX_COORDINATE = 30_000_000;
const MAX_Y = 4096;
const ONLINE_WINDOW_MS = 90_000;
const TOKEN_PREFIX = 'aex_';
const MAX_PAGE_SIZE = 200;
const MAX_MAP_POINTS = 20_000;

function stripControl(value, { keepNewlines = false } = {}) {
  const pattern = keepNewlines ? /[\u0000-\u0009\u000B-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g;
  return String(value ?? '').replace(/\r\n?/g, '\n').replace(pattern, '');
}

function normalizeText(value, maxLength, options) {
  return stripControl(value, options).trim().slice(0, maxLength);
}

function normalizeScopeName(value, maxLength) {
  return normalizeText(value, maxLength).toLowerCase();
}

function normalizeInteger(value, limit) {
  const number = Number(value);
  if (!Number.isInteger(number) || Math.abs(number) > limit) return null;
  return number;
}

function normalizeFoundAt(value, now = Date.now()) {
  const time = typeof value === 'number' ? value : Date.parse(String(value || ''));
  // Not before Minecraft, not more than a day ahead of the server's clock
  if (!Number.isFinite(time) || time < Date.UTC(2009, 0, 1) || time > now + 86_400_000) return null;
  return new Date(time);
}

/** A find as the mod sends it, checked and trimmed; null if it isn't one. */
function normalizeFind(raw, now = Date.now()) {
  if (!raw || typeof raw !== 'object') return null;
  const kind = String(raw.kind || '').toUpperCase();
  if (!KINDS.includes(kind)) return null;
  const x = normalizeInteger(raw.x, MAX_COORDINATE);
  const y = normalizeInteger(raw.y, MAX_Y);
  const z = normalizeInteger(raw.z, MAX_COORDINATE);
  const foundAt = normalizeFoundAt(raw.foundAt, now);
  const name = normalizeText(raw.name, 128);
  if (x === null || y === null || z === null || !foundAt || !name) return null;
  const count = kind === 'ITEM' ? Math.min(Math.max(normalizeInteger(raw.count, 1_000_000) ?? 1, 1), 1_000_000) : 0;
  return {
    kind, x, y, z, foundAt, name, count,
    label: normalizeText(raw.label, 512, { keepNewlines: kind === 'SIGN' }),
    details: normalizeText(raw.details, 2000, { keepNewlines: kind === 'SIGN' })
  };
}

/** What makes two finds the same: a sign's block; an item's block, kind, count and name; a marker's block and what it marks. Bases are told apart by distance. */
function dedupeKey(find) {
  const at = `${find.kind}:${find.x}:${find.y}:${find.z}`;
  if (find.kind === 'MARKER') return `${at}:${find.name}`;
  return find.kind === 'ITEM' ? `${at}:${find.name}:${find.count}:${find.label}` : at;
}

function normalizeStatus(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const percent = Number(raw.percent);
  const eta = Number(raw.etaSeconds);
  const yaw = raw.yaw === null || raw.yaw === undefined || raw.yaw === '' ? NaN : Number(raw.yaw);
  const area = raw.area && typeof raw.area === 'object' ? {
    minX: normalizeInteger(raw.area.minX, MAX_COORDINATE),
    minZ: normalizeInteger(raw.area.minZ, MAX_COORDINATE),
    maxX: normalizeInteger(raw.area.maxX, MAX_COORDINATE),
    maxZ: normalizeInteger(raw.area.maxZ, MAX_COORDINATE)
  } : null;
  const runFinds = raw.runFinds && typeof raw.runFinds === 'object' ? {
    bases: Math.max(0, normalizeInteger(raw.runFinds.bases, 1e9) ?? 0),
    signs: Math.max(0, normalizeInteger(raw.runFinds.signs, 1e9) ?? 0),
    items: Math.max(0, normalizeInteger(raw.runFinds.items, 1e9) ?? 0)
  } : null;
  return {
    player: normalizeText(raw.player, 16),
    phase: normalizeText(raw.phase, 16).toUpperCase() || 'IDLE',
    mode: normalizeText(raw.mode, 16),
    paused: raw.paused === true,
    percent: Number.isFinite(percent) ? Math.min(Math.max(percent, 0), 100) : null,
    etaSeconds: Number.isFinite(eta) && eta >= 0 ? Math.min(Math.round(eta), 10 * 365 * 86_400) : null,
    x: normalizeInteger(raw.x, MAX_COORDINATE),
    y: normalizeInteger(raw.y, MAX_Y),
    z: normalizeInteger(raw.z, MAX_COORDINATE),
    yaw: Number.isFinite(yaw) ? ((yaw % 360) + 360) % 360 : null,
    area: area && Object.values(area).every(value => value !== null) ? area : null,
    runFinds
  };
}

function publicFind(row) {
  return {
    id: String(row.id),
    server: row.server,
    dimension: row.dimension,
    kind: row.kind,
    x: row.x,
    y: row.y,
    z: row.z,
    foundAt: row.found_at,
    name: row.name,
    count: row.item_count,
    label: row.label,
    details: row.details
  };
}

function publicStatus(row, now = Date.now()) {
  const updatedAt = new Date(row.updated_at);
  return {
    tokenId: String(row.token_id),
    tokenName: row.token_name || null,
    server: row.server,
    dimension: row.dimension,
    player: row.player,
    phase: row.phase,
    mode: row.mode,
    paused: row.paused,
    percent: row.percent === null || row.percent === undefined ? null : Number(row.percent),
    etaSeconds: row.eta_seconds,
    x: row.x,
    y: row.y ?? null,
    z: row.z,
    area: row.area || null,
    yaw: row.yaw === null || row.yaw === undefined ? null : Number(row.yaw),
    runFinds: row.run_finds || null,
    updatedAt: row.updated_at,
    online: row.phase !== 'IDLE' && now - updatedAt.getTime() <= ONLINE_WINDOW_MS
  };
}

function publicToken(row) {
  return {
    id: String(row.id),
    name: row.name,
    hint: row.token_hint,
    createdBy: row.created_by,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at
  };
}

function generateToken() {
  return TOKEN_PREFIX + crypto.randomBytes(32).toString('base64url');
}

function bearerToken(req) {
  const match = String(req.headers.authorization || '').match(/^Bearer\s+(\S{10,200})$/i);
  return match ? match[1] : '';
}

function likePattern(text) {
  return `%${text.replace(/[\\%_]/g, char => `\\${char}`)}%`;
}

function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

function createAreaExplorerService({ pool, hashToken, readJsonBody, sendJson, sendError, enforceRateLimit, publish = () => {}, recordSystemLog = async () => {} }) {
  async function authenticate(req) {
    const token = bearerToken(req);
    if (!token) return null;
    const result = await pool.query(
      `UPDATE area_explorer_tokens SET last_used_at = NOW()
       WHERE token_hash = $1 AND revoked_at IS NULL
       RETURNING id, name`,
      [hashToken(token)]
    );
    return result.rows[0] || null;
  }

  /**
   * Stores a batch of finds for one server and dimension, skipping the ones in already, and the
   * mod's status. Bases are checked against each other under a lock on the scope, so two batches
   * can't both add the same base.
   */
  async function ingest(token, body, now = Date.now()) {
    const server = normalizeScopeName(body.server, 128);
    const dimension = normalizeScopeName(body.dimension, 64);
    if (!server || !dimension) throw httpError(400, 'server and dimension are required.');
    const rawFinds = Array.isArray(body.finds) ? body.finds : [];
    if (rawFinds.length > MAX_FINDS_PER_BATCH) throw httpError(413, `At most ${MAX_FINDS_PER_BATCH} finds per request.`);
    const finds = rawFinds.map(raw => normalizeFind(raw, now)).filter(Boolean);
    const status = normalizeStatus(body.status);

    let added = 0;
    let liveStatus = null;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (finds.some(find => find.kind === 'BASE')) {
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`area-explorer:${server}:${dimension}`]);
      }
      for (const find of finds.filter(f => f.kind === 'BASE')) {
        const near = await client.query(
          `SELECT 1 FROM area_explorer_finds
           WHERE server = $1 AND dimension = $2 AND kind = 'BASE'
             AND (x - $3::bigint) * (x - $3::bigint) + (z - $4::bigint) * (z - $4::bigint) <= $5::bigint
           LIMIT 1`,
          [server, dimension, find.x, find.z, SAME_BASE_DISTANCE * SAME_BASE_DISTANCE]
        );
        if (near.rows.length) continue;
        added += (await insertFinds(client, server, dimension, [find], token.id)).length;
      }
      const others = finds.filter(f => f.kind !== 'BASE');
      if (others.length) added += (await insertFinds(client, server, dimension, others, token.id)).length;
      if (status) liveStatus = await upsertStatus(client, token.id, server, dimension, status);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
    if (added > 0 || status) publish('area_explorer_updated', { server, dimension, added, status: Boolean(status), ...(liveStatus ? { liveStatus } : {}) });
    return { received: rawFinds.length, accepted: finds.length, added, duplicates: finds.length - added };
  }

  async function insertFinds(client, server, dimension, finds, tokenId) {
    const columns = { kind: [], x: [], y: [], z: [], foundAt: [], name: [], count: [], label: [], details: [], key: [] };
    for (const find of finds) {
      columns.kind.push(find.kind);
      columns.x.push(find.x);
      columns.y.push(find.y);
      columns.z.push(find.z);
      columns.foundAt.push(find.foundAt.toISOString());
      columns.name.push(find.name);
      columns.count.push(find.count);
      columns.label.push(find.label);
      columns.details.push(find.details);
      columns.key.push(dedupeKey(find));
    }
    const result = await client.query(
      `INSERT INTO area_explorer_finds (server, dimension, kind, x, y, z, found_at, name, item_count, label, details, dedupe_key, token_id)
       SELECT $1, $2, f.kind, f.x, f.y, f.z, f.found_at, f.name, f.item_count, f.label, f.details, f.dedupe_key, $13
       FROM unnest($3::text[], $4::int[], $5::int[], $6::int[], $7::timestamptz[], $8::text[], $9::int[], $10::text[], $11::text[], $12::text[])
         AS f(kind, x, y, z, found_at, name, item_count, label, details, dedupe_key)
       ON CONFLICT (server, dimension, dedupe_key) DO NOTHING
       RETURNING id`,
      [server, dimension, columns.kind, columns.x, columns.y, columns.z, columns.foundAt, columns.name,
        columns.count, columns.label, columns.details, columns.key, tokenId]
    );
    return result.rows;
  }

  async function upsertStatus(client, tokenId, server, dimension, status) {
    const result = await client.query(
      `INSERT INTO area_explorer_status (token_id, server, dimension, player, phase, mode, paused, percent, eta_seconds, x, y, z, area, run_finds, yaw, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
       ON CONFLICT (token_id) DO UPDATE SET
         server = EXCLUDED.server, dimension = EXCLUDED.dimension, player = EXCLUDED.player, phase = EXCLUDED.phase,
         mode = EXCLUDED.mode, paused = EXCLUDED.paused, percent = EXCLUDED.percent, eta_seconds = EXCLUDED.eta_seconds,
         x = EXCLUDED.x, y = EXCLUDED.y, z = EXCLUDED.z, area = EXCLUDED.area, run_finds = EXCLUDED.run_finds, yaw = EXCLUDED.yaw, updated_at = NOW()
       RETURNING *`,
      [tokenId, server, dimension, status.player, status.phase, status.mode, status.paused, status.percent, status.etaSeconds,
        status.x, status.y, status.z, status.area ? JSON.stringify(status.area) : null, status.runFinds ? JSON.stringify(status.runFinds) : null, status.yaw]
    );
    return publicStatus(result.rows[0]);
  }

  async function getLive() {
    const result = await pool.query(`SELECT s.*, t.name AS token_name FROM area_explorer_status s
      JOIN area_explorer_tokens t ON t.id = s.token_id WHERE t.revoked_at IS NULL ORDER BY s.updated_at DESC`);
    return { statuses: result.rows.map(row => publicStatus(row)) };
  }

  /** POST /api/area-explorer/ingest - from the mod, with its token instead of a session. */
  async function handleIngest(req, res) {
    if (req.method !== 'POST') {
      sendError(res, 405, 'Use POST.');
      return;
    }
    const token = await authenticate(req);
    if (!token) {
      sendError(res, 401, 'A valid Area Explorer token is required.');
      return;
    }
    if (!enforceRateLimit(req, res, 'area_explorer_ingest', `token:${token.id}`, { limit: 120, windowMs: 60_000 })) return;
    const body = await readJsonBody(req, MAX_INGEST_BYTES);
    sendJson(res, 200, await ingest(token, body));
  }

  async function getSummary() {
    const [counts, statuses, markerNames] = await Promise.all([
      pool.query(`SELECT server, dimension, kind, COUNT(*)::int AS count, MAX(found_at) AS last_found_at
                  FROM area_explorer_finds GROUP BY server, dimension, kind ORDER BY server, dimension, kind`),
      pool.query(`SELECT s.*, t.name AS token_name FROM area_explorer_status s
                  JOIN area_explorer_tokens t ON t.id = s.token_id
                  WHERE t.revoked_at IS NULL ORDER BY s.updated_at DESC`),
      pool.query(`SELECT server, dimension, name, COUNT(*)::int AS count FROM area_explorer_finds
                  WHERE kind = 'MARKER' GROUP BY server, dimension, name ORDER BY count DESC, name`)
    ]);
    const scopes = new Map();
    for (const row of counts.rows) {
      const key = `${row.server}\u0000${row.dimension}`;
      if (!scopes.has(key)) scopes.set(key, { server: row.server, dimension: row.dimension, bases: 0, signs: 0, items: 0, markers: 0, markerNames: [], lastFoundAt: null });
      const scope = scopes.get(key);
      scope[{ BASE: 'bases', SIGN: 'signs', ITEM: 'items', MARKER: 'markers' }[row.kind]] = row.count;
      if (!scope.lastFoundAt || new Date(row.last_found_at) > new Date(scope.lastFoundAt)) scope.lastFoundAt = row.last_found_at;
    }
    // What the markers mark, most first: End Portal 12, Shulker Box 5...
    for (const row of markerNames.rows) {
      scopes.get(`${row.server}\u0000${row.dimension}`)?.markerNames.push({ name: row.name, count: row.count });
    }
    return { scopes: [...scopes.values()], statuses: statuses.rows.map(row => publicStatus(row)) };
  }

  function scopeFilter(url, params, where) {
    const server = normalizeScopeName(url.searchParams.get('server'), 128);
    const dimension = normalizeScopeName(url.searchParams.get('dimension'), 64);
    if (server) { params.push(server); where.push(`server = $${params.length}`); }
    if (dimension) { params.push(dimension); where.push(`dimension = $${params.length}`); }
    const kind = String(url.searchParams.get('kind') || '').toUpperCase();
    if (KINDS.includes(kind)) { params.push(kind); where.push(`kind = $${params.length}`); }
    // One kind of marker: "End Portal"
    const name = normalizeText(url.searchParams.get('name'), 128);
    if (kind === 'MARKER' && name) { params.push(name); where.push(`name = $${params.length}`); }
  }

  async function getFinds(url) {
    const params = [];
    const where = [];
    scopeFilter(url, params, where);
    const q = normalizeText(url.searchParams.get('q'), 100);
    if (q) {
      params.push(likePattern(q));
      where.push(`(name ILIKE $${params.length} OR label ILIKE $${params.length} OR details ILIKE $${params.length})`);
    }
    const limit = Math.min(Math.max(Number.parseInt(url.searchParams.get('limit'), 10) || 50, 1), MAX_PAGE_SIZE);
    const offset = Math.min(Math.max(Number.parseInt(url.searchParams.get('offset'), 10) || 0, 0), 1_000_000);
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [rows, total] = await Promise.all([
      pool.query(`SELECT * FROM area_explorer_finds ${whereSql} ORDER BY found_at DESC, id DESC LIMIT ${limit} OFFSET ${offset}`, params),
      pool.query(`SELECT COUNT(*)::int AS total FROM area_explorer_finds ${whereSql}`, params)
    ]);
    return { finds: rows.rows.map(publicFind), total: total.rows[0]?.total || 0, limit, offset };
  }

  /** Every find of the scope as a point for the map: [id, kind, x, z]. */
  async function getMapPoints(url) {
    const params = [];
    const where = [];
    scopeFilter(url, params, where);
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = await pool.query(`SELECT id, kind, x, z FROM area_explorer_finds ${whereSql} ORDER BY found_at DESC LIMIT ${MAX_MAP_POINTS}`, params);
    return { points: rows.rows.map(row => [String(row.id), row.kind, row.x, row.z]), truncated: rows.rows.length >= MAX_MAP_POINTS };
  }

  async function getFind(id) {
    if (!/^\d{1,18}$/.test(id)) throw httpError(400, 'Invalid find id.');
    const row = (await pool.query('SELECT * FROM area_explorer_finds WHERE id = $1', [id])).rows[0];
    if (!row) throw httpError(404, 'Find not found.');
    return { find: publicFind(row) };
  }

  async function listTokens() {
    const rows = await pool.query('SELECT * FROM area_explorer_tokens ORDER BY revoked_at IS NOT NULL, created_at DESC');
    return { tokens: rows.rows.map(publicToken) };
  }

  async function createToken(currentUser, body) {
    const name = normalizeText(body?.name, 64);
    if (!name) throw httpError(400, 'Give the token a name, such as the PC it is for.');
    const token = generateToken();
    const row = (await pool.query(
      `INSERT INTO area_explorer_tokens (name, token_hash, token_hint, created_by) VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, hashToken(token), token.slice(-4), currentUser.username]
    )).rows[0];
    await recordSystemLog({ category: 'area_explorer', actor: currentUser.username, message: `Area Explorer token "${name}" created.` });
    // The only time the token itself is shown
    return { token, record: publicToken(row) };
  }

  async function revokeToken(currentUser, id) {
    if (!/^\d{1,18}$/.test(id)) throw httpError(400, 'Invalid token id.');
    const row = (await pool.query(
      'UPDATE area_explorer_tokens SET revoked_at = NOW() WHERE id = $1 AND revoked_at IS NULL RETURNING *', [id]
    )).rows[0];
    if (!row) throw httpError(404, 'Token not found or already revoked.');
    await recordSystemLog({ category: 'area_explorer', actor: currentUser.username, message: `Area Explorer token "${row.name}" revoked.` });
    publish('area_explorer_updated', { tokenRevoked: true });
    return { record: publicToken(row) };
  }

  /**
   * The dashboard's routes, for a signed-in user: {statusCode, payload}, or null for a path that
   * isn't one of them. Token routes are for administrators only.
   */
  async function handleApi(req, currentUser, url, { assertAdmin, readBody }) {
    const path = url.pathname;
    if (path === '/api/area-explorer/summary' && req.method === 'GET') return { statusCode: 200, payload: await getSummary() };
    if (path === '/api/area-explorer/live' && req.method === 'GET') return { statusCode: 200, payload: await getLive() };
    if (path === '/api/area-explorer/finds' && req.method === 'GET') return { statusCode: 200, payload: await getFinds(url) };
    if (path === '/api/area-explorer/map' && req.method === 'GET') return { statusCode: 200, payload: await getMapPoints(url) };
    const findMatch = path.match(/^\/api\/area-explorer\/finds\/([^/]+)$/);
    if (findMatch && req.method === 'GET') return { statusCode: 200, payload: await getFind(findMatch[1]) };
    if (path === '/api/admin/area-explorer/tokens') {
      assertAdmin(currentUser);
      if (req.method === 'GET') return { statusCode: 200, payload: await listTokens() };
      if (req.method === 'POST') return { statusCode: 201, payload: await createToken(currentUser, await readBody(req)) };
    }
    const tokenMatch = path.match(/^\/api\/admin\/area-explorer\/tokens\/([^/]+)$/);
    if (tokenMatch && req.method === 'DELETE') {
      assertAdmin(currentUser);
      return { statusCode: 200, payload: await revokeToken(currentUser, tokenMatch[1]) };
    }
    return null;
  }

  return { authenticate, ingest, handleIngest, handleApi, getSummary, getFinds, getMapPoints, listTokens, createToken, revokeToken };
}

module.exports = {
  KINDS,
  SAME_BASE_DISTANCE,
  MAX_FINDS_PER_BATCH,
  TOKEN_PREFIX,
  bearerToken,
  createAreaExplorerService,
  dedupeKey,
  generateToken,
  normalizeFind,
  normalizeStatus,
  publicFind,
  publicStatus
};
