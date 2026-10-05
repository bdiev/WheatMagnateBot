'use strict';

// The live Xaero map: the OnFocus mod sends each region of Xaero's World Map (512 x 512 blocks,
// one pixel a block) as a PNG as it gets drawn, and the dashboard shows them as a zoomable map.
//
// Tiles are anchored to the world: level 0 is the regions themselves, a level-k tile covers 2^k
// regions a side shrunk to 512 px, so it is built from the four level k-1 tiles under it. Uploads
// mark the tile above dirty; a background worker rebuilds dirty tiles a level at a time, which in
// turn marks the tile above theirs, until the top.

const sharp = require('sharp');

const REGION_PX = 512;
// The map covers at most 100,000 x 100,000 blocks around 0, 0; the dashboard shows 30k, 50k or all of it
const MAX_DISTANCE = 50_000;
// Level 8: a tile is 256 regions, 131,072 blocks a side - the whole map in four tiles
const MAX_LEVEL = 8;
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const DEFAULT_MAX_BYTES = 8 * 1024 * 1024 * 1024;
const SIZE_CHECK_INTERVAL_MS = 10 * 60_000;
// A tile is rebuilt once it has been dirty this long, so a burst of uploads under it costs one rebuild
const DIRTY_SETTLE_MS = 5_000;
const WORKER_BATCH = 16;
const WORKER_IDLE_MS = 5_000;
const PUBLISH_INTERVAL_MS = 5_000;
const MAX_PUBLISHED_TILES = 400;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

function normalizeScopeName(value, maxLength) {
  return String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, maxLength).toLowerCase();
}

function scopeFrom(url) {
  const server = normalizeScopeName(url.searchParams.get('server'), 128);
  const dimension = normalizeScopeName(url.searchParams.get('dimension'), 64);
  if (!server || !dimension) throw httpError(400, 'server and dimension are required.');
  return { server, dimension };
}

function parseRegionCoordinate(value) {
  if (!/^-?\d{1,6}$/.test(String(value))) return null;
  const number = Number(value);
  return tileInRange(0, number) ? number : null;
}

/** Whether a tile of the level, along one axis, reaches into the map's 100k x 100k square. */
function tileInRange(level, coordinate) {
  const blocks = REGION_PX * 2 ** level;
  return coordinate * blocks < MAX_DISTANCE && (coordinate + 1) * blocks > -MAX_DISTANCE;
}

/** The tile one level up that a tile is part of. */
function parentOf(level, x, z) {
  return { level: level + 1, x: Math.floor(x / 2), z: Math.floor(z / 2) };
}

function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > maxBytes) {
      reject(httpError(413, 'The region image is too large.'));
      req.resume();
      return;
    }
    const chunks = [];
    let size = 0;
    let failed = false;
    req.on('data', chunk => {
      if (failed) return;
      size += chunk.length;
      if (size > maxBytes) {
        failed = true;
        reject(httpError(413, 'The region image is too large.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => { if (!failed) resolve(Buffer.concat(chunks)); });
    req.on('error', error => { if (!failed) { failed = true; reject(error); } });
  });
}

/** A region's PNG as a level-0 tile: lossless WebP, null when it has no drawn pixel at all. */
async function regionTileFromPng(png) {
  if (png.length < PNG_SIGNATURE.length || !png.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw httpError(400, 'The region must be a PNG.');
  }
  let image;
  try {
    image = sharp(png).ensureAlpha();
    const metadata = await image.metadata();
    if (metadata.width !== REGION_PX || metadata.height !== REGION_PX) throw httpError(400, `A region is ${REGION_PX} x ${REGION_PX} pixels.`);
  } catch (error) {
    throw error.statusCode ? error : httpError(400, 'The region PNG could not be read.');
  }
  const { channels } = await image.stats();
  if (channels[3].max === 0) return null;
  return image.webp({ lossless: true, effort: 4 }).toBuffer();
}

/**
 * A tile one level up from the four under it ({dx, dz, data} with dx, dz 0 or 1): halved, so each
 * pixel is the average of four. Lossy, since it's a shrunk picture anyway. Null with no children.
 */
async function parentTileFromChildren(children) {
  if (!children.length) return null;
  const composed = await sharp({ create: { width: REGION_PX * 2, height: REGION_PX * 2, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(children.map(child => ({ input: child.data, left: child.dx * REGION_PX, top: child.dz * REGION_PX })))
    .raw()
    .toBuffer();
  return sharp(composed, { raw: { width: REGION_PX * 2, height: REGION_PX * 2, channels: 4 } })
    .resize(REGION_PX, REGION_PX)
    .webp({ quality: 88, alphaQuality: 100, effort: 4 })
    .toBuffer();
}

function createXaeroRegionMapService({
  pool, authenticate, enforceRateLimit, sendJson, sendError,
  publish = () => {}, recordSystemLog = async () => {},
  maxBytes = Number(process.env.XAERO_MAP_MAX_BYTES) || DEFAULT_MAX_BYTES,
  now = () => Date.now()
}) {
  let storedBytes = null;
  let storedBytesCheckedAt = 0;
  let workerTimer = null;
  let workerRunning = false;
  let stopped = false;
  const pendingPublish = new Map();
  let publishTimer = null;

  async function storageBytes() {
    if (storedBytes === null || now() - storedBytesCheckedAt > SIZE_CHECK_INTERVAL_MS) {
      const row = (await pool.query(`SELECT COALESCE(SUM(octet_length(data)), 0)::bigint AS bytes FROM area_explorer_region_tiles`)).rows[0];
      storedBytes = Number(row.bytes);
      storedBytesCheckedAt = now();
    }
    return storedBytes;
  }

  /** Tells open dashboards which tiles changed, a few seconds' worth at a time. */
  function queuePublish(scope, level, x, z) {
    const key = `${scope.server}\u0000${scope.dimension}`;
    if (!pendingPublish.has(key)) pendingPublish.set(key, { ...scope, tiles: new Set() });
    const entry = pendingPublish.get(key);
    if (entry.tiles.size <= MAX_PUBLISHED_TILES) entry.tiles.add(`${level},${x},${z}`);
    if (!publishTimer) {
      publishTimer = setTimeout(flushPublish, PUBLISH_INTERVAL_MS);
      publishTimer.unref?.();
    }
  }

  function flushPublish() {
    publishTimer = null;
    for (const entry of pendingPublish.values()) {
      const all = entry.tiles.size > MAX_PUBLISHED_TILES;
      publish('area_explorer_updated', {
        mapTiles: { server: entry.server, dimension: entry.dimension, all, tiles: all ? [] : [...entry.tiles].map(tile => tile.split(',').map(Number)) }
      });
    }
    pendingPublish.clear();
  }

  async function markDirty(scope, level, x, z) {
    if (level > MAX_LEVEL) return;
    await pool.query(
      `INSERT INTO area_explorer_region_dirty (server, dimension, level, x, z) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT DO NOTHING`,
      [scope.server, scope.dimension, level, x, z]
    );
  }

  /** The mod's list of regions the site has, and when each was drawn: [x, z, modifiedMs]. */
  async function regionIndex(scope) {
    const rows = await pool.query(
      `SELECT x, z, (EXTRACT(EPOCH FROM source_modified_at) * 1000)::bigint AS modified
       FROM area_explorer_region_tiles WHERE server = $1 AND dimension = $2 AND level = 0`,
      [scope.server, scope.dimension]
    );
    return { regions: rows.rows.map(row => [row.x, row.z, Number(row.modified)]) };
  }

  /** Stores one region from the mod, unless the site has it from the same or a later drawing. */
  async function putRegion(scope, x, z, modifiedMs, png) {
    const existing = (await pool.query(
      `SELECT (EXTRACT(EPOCH FROM source_modified_at) * 1000)::bigint AS modified FROM area_explorer_region_tiles
       WHERE server = $1 AND dimension = $2 AND level = 0 AND x = $3 AND z = $4`,
      [scope.server, scope.dimension, x, z]
    )).rows[0];
    if (existing && Number(existing.modified) >= modifiedMs) return { stored: false, reason: 'up to date' };
    if (!existing && await storageBytes() >= maxBytes) {
      throw httpError(507, 'The map storage limit (XAERO_MAP_MAX_BYTES) is reached; new regions are refused.');
    }
    const tile = await regionTileFromPng(png);
    if (!tile) {
      if (existing) await pool.query('DELETE FROM area_explorer_region_tiles WHERE server = $1 AND dimension = $2 AND level = 0 AND x = $3 AND z = $4', [scope.server, scope.dimension, x, z]);
    } else {
      await pool.query(
        `INSERT INTO area_explorer_region_tiles (server, dimension, level, x, z, data, source_modified_at, updated_at)
         VALUES ($1, $2, 0, $3, $4, $5, to_timestamp($6 / 1000.0), NOW())
         ON CONFLICT (server, dimension, level, x, z)
         DO UPDATE SET data = EXCLUDED.data, source_modified_at = EXCLUDED.source_modified_at, updated_at = NOW()`,
        [scope.server, scope.dimension, x, z, tile, modifiedMs]
      );
      if (storedBytes !== null) storedBytes += tile.length;
    }
    const parent = parentOf(0, x, z);
    await markDirty(scope, parent.level, parent.x, parent.z);
    queuePublish(scope, 0, x, z);
    scheduleWorker(DIRTY_SETTLE_MS);
    return { stored: Boolean(tile) };
  }

  /** Rebuilds one dirty tile from the four under it, and marks the one above it. */
  async function rebuildTile(scope, level, x, z) {
    const children = (await pool.query(
      `SELECT x, z, data FROM area_explorer_region_tiles
       WHERE server = $1 AND dimension = $2 AND level = $3 AND x BETWEEN $4 AND $5 AND z BETWEEN $6 AND $7`,
      [scope.server, scope.dimension, level - 1, x * 2, x * 2 + 1, z * 2, z * 2 + 1]
    )).rows.map(row => ({ dx: row.x - x * 2, dz: row.z - z * 2, data: Buffer.from(row.data) }));
    const tile = await parentTileFromChildren(children);
    if (tile) {
      await pool.query(
        `INSERT INTO area_explorer_region_tiles (server, dimension, level, x, z, data, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (server, dimension, level, x, z) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
        [scope.server, scope.dimension, level, x, z, tile]
      );
    } else {
      await pool.query('DELETE FROM area_explorer_region_tiles WHERE server = $1 AND dimension = $2 AND level = $3 AND x = $4 AND z = $5', [scope.server, scope.dimension, level, x, z]);
    }
    const parent = parentOf(level, x, z);
    await markDirty(scope, parent.level, parent.x, parent.z);
    queuePublish(scope, level, x, z);
  }

  /**
   * Rebuilds settled dirty tiles, the lowest level first so a tile is built from fresh children;
   * true if there may be more to do right away.
   */
  async function processDirty({ settleMs = DIRTY_SETTLE_MS } = {}) {
    // Taken off the list first: an upload under a tile while it's being rebuilt marks it again
    const rows = (await pool.query(
      `DELETE FROM area_explorer_region_dirty WHERE (server, dimension, level, x, z) IN (
         SELECT server, dimension, level, x, z FROM area_explorer_region_dirty
         WHERE dirty_at <= NOW() - make_interval(secs => $1 / 1000.0)
         ORDER BY level, dirty_at LIMIT $2
       ) RETURNING server, dimension, level, x, z`,
      [settleMs, WORKER_BATCH]
    )).rows;
    for (const row of rows) {
      try {
        await rebuildTile({ server: row.server, dimension: row.dimension }, row.level, row.x, row.z);
      } catch (error) {
        // Back on the list for the next round
        await markDirty({ server: row.server, dimension: row.dimension }, row.level, row.x, row.z).catch(() => {});
        throw error;
      }
    }
    return rows.length === WORKER_BATCH;
  }

  function scheduleWorker(delayMs) {
    if (stopped || workerRunning || workerTimer) return;
    workerTimer = setTimeout(runWorker, delayMs);
    workerTimer.unref?.();
  }

  async function runWorker() {
    workerTimer = null;
    workerRunning = true;
    let more = false;
    let failed = false;
    try {
      more = await processDirty();
    } catch (error) {
      failed = true;
      await recordSystemLog({ level: 'warn', category: 'area_explorer', message: `Xaero map tile rebuild failed: ${error.message}` });
    } finally {
      workerRunning = false;
    }
    if (stopped) return;
    if (more && !failed) {
      scheduleWorker(0);
      return;
    }
    // Anything still dirty (not settled yet, or from before a restart) gets another look later
    const left = (await pool.query('SELECT 1 FROM area_explorer_region_dirty LIMIT 1').catch(() => ({ rows: [] }))).rows.length;
    if (left) scheduleWorker(failed ? 60_000 : WORKER_IDLE_MS);
  }

  /** Starts working off what a restart left dirty. */
  function start() {
    stopped = false;
    scheduleWorker(WORKER_IDLE_MS);
  }

  function stop() {
    stopped = true;
    if (workerTimer) clearTimeout(workerTimer);
    workerTimer = null;
  }

  /** The dashboard's index of a scope: the regions there are (flat [x, z, ...]) and the deepest level. */
  async function mapIndex(scope) {
    const rows = await pool.query(
      'SELECT x, z FROM area_explorer_region_tiles WHERE server = $1 AND dimension = $2 AND level = 0',
      [scope.server, scope.dimension]
    );
    const regions = new Array(rows.rows.length * 2);
    rows.rows.forEach((row, index) => { regions[index * 2] = row.x; regions[index * 2 + 1] = row.z; });
    return { regionSize: REGION_PX, maxLevel: MAX_LEVEL, maxDistance: MAX_DISTANCE, regions };
  }

  /** Every scope with a live map, for the dashboard's server/dimension picker. */
  async function mapScopes() {
    const rows = await pool.query(
      `SELECT server, dimension, COUNT(*)::int AS regions, MAX(updated_at) AS updated_at
       FROM area_explorer_region_tiles WHERE level = 0 GROUP BY server, dimension ORDER BY server, dimension`
    );
    return { scopes: rows.rows.map(row => ({ server: row.server, dimension: row.dimension, regions: row.regions, updatedAt: row.updated_at })) };
  }

  async function sendTile(req, res, scope, level, x, z) {
    const row = (await pool.query(
      `SELECT data, (EXTRACT(EPOCH FROM updated_at) * 1000)::bigint AS version FROM area_explorer_region_tiles
       WHERE server = $1 AND dimension = $2 AND level = $3 AND x = $4 AND z = $5`,
      [scope.server, scope.dimension, level, x, z]
    )).rows[0];
    if (!row) {
      res.writeHead(404, { 'Cache-Control': 'private, no-cache' });
      res.end();
      return;
    }
    // Tiles change as the map is drawn: the browser keeps them, but asks each time it loads one
    const etag = `"${row.version}"`;
    const headers = { 'Cache-Control': 'private, no-cache', ETag: etag, 'X-Content-Type-Options': 'nosniff' };
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, headers);
      res.end();
      return;
    }
    const data = Buffer.from(row.data);
    res.writeHead(200, { ...headers, 'Content-Type': 'image/webp', 'Content-Length': data.length });
    res.end(req.method === 'HEAD' ? undefined : data);
  }

  /** The mod's routes, with its API token instead of a session: true when the request was one of them. */
  async function handleModRequest(req, res, url) {
    const indexRoute = url.pathname === '/api/area-explorer/mod/map/regions';
    const regionRoute = url.pathname.match(/^\/api\/area-explorer\/mod\/map\/regions\/(-?\d{1,6})\/(-?\d{1,6})$/);
    if (!indexRoute && !regionRoute) return false;
    const token = await authenticate(req);
    if (!token) {
      sendError(res, 401, 'A valid Area Explorer token is required.');
      return true;
    }
    if (!enforceRateLimit(req, res, 'area_explorer_map', `token:${token.id}`, { limit: 1200, windowMs: 60_000 })) return true;
    const scope = scopeFrom(url);
    if (indexRoute) {
      if (req.method !== 'GET') { sendError(res, 405, 'Use GET.'); return true; }
      sendJson(res, 200, await regionIndex(scope));
      return true;
    }
    if (req.method !== 'PUT') { sendError(res, 405, 'Use PUT.'); return true; }
    const x = parseRegionCoordinate(regionRoute[1]);
    const z = parseRegionCoordinate(regionRoute[2]);
    if (x === null || z === null) throw httpError(400, `The map only takes regions within ${MAX_DISTANCE} blocks of 0, 0.`);
    const modified = Number(url.searchParams.get('modified'));
    if (!Number.isSafeInteger(modified) || modified < Date.UTC(2009, 0, 1) || modified > now() + 86_400_000) {
      throw httpError(400, 'modified must be when the region was drawn, in milliseconds.');
    }
    const png = await readBody(req, MAX_UPLOAD_BYTES);
    sendJson(res, 200, await putRegion(scope, x, z, modified, png));
    return true;
  }

  /** The dashboard's routes, for a signed-in user: true when the request was one of them. */
  async function handleRequest(req, res, url) {
    if (url.pathname === '/api/area-explorer/map/scopes' && req.method === 'GET') {
      sendJson(res, 200, await mapScopes());
      return true;
    }
    if (url.pathname === '/api/area-explorer/map/index' && req.method === 'GET') {
      sendJson(res, 200, await mapIndex(scopeFrom(url)));
      return true;
    }
    const tileRoute = url.pathname.match(/^\/api\/area-explorer\/map\/tiles\/(\d{1,2})\/(-?\d{1,6})\/(-?\d{1,6})\.webp$/);
    if (tileRoute && ['GET', 'HEAD'].includes(req.method)) {
      const level = Number(tileRoute[1]);
      const x = Number(tileRoute[2]), z = Number(tileRoute[3]);
      if (level > MAX_LEVEL || !tileInRange(level, x) || !tileInRange(level, z)) {
        res.writeHead(404, { 'Cache-Control': 'private, max-age=86400' });
        res.end();
        return true;
      }
      await sendTile(req, res, scopeFrom(url), level, x, z);
      return true;
    }
    return false;
  }

  return {
    handleModRequest, handleRequest, start, stop,
    putRegion, processDirty, regionIndex, mapIndex, mapScopes, flushPublish
  };
}

module.exports = {
  createXaeroRegionMapService,
  parentOf,
  parentTileFromChildren,
  regionTileFromPng,
  tileInRange,
  MAX_DISTANCE,
  MAX_LEVEL,
  REGION_PX
};
