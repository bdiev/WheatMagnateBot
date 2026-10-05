'use strict';

// Xaero's World Map under the Area Explorer map: an administrator uploads a PNG exported from
// Xaero's map screen, it is cut into a pyramid of 256 px WebP tiles kept in the database, and
// the dashboard draws the tiles behind the finds. Xaero's export carries no coordinates, so each
// layer stores where its top-left pixel is in the world and how many blocks a pixel covers; an
// administrator can correct that afterwards without re-cutting anything.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');

const TILE_SIZE = 256;
const MAX_UPLOAD_BYTES = 256 * 1024 * 1024;
// About 20,000 x 20,000 blocks at one pixel per block
const MAX_INPUT_PIXELS = 400_000_000;
const MAX_COORDINATE = 30_000_000;
const MIN_BLOCKS_PER_PIXEL = 1 / 16;
const MAX_BLOCKS_PER_PIXEL = 64;
const TILE_INSERT_BATCH = 100;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

function normalizeText(value, maxLength) {
  return String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, maxLength);
}

function normalizeScopeName(value, maxLength) {
  return normalizeText(value, maxLength).toLowerCase();
}

function normalizeCoordinate(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || Math.abs(number) > MAX_COORDINATE) return null;
  return Math.round(number * 16) / 16;
}

function normalizeBlocksPerPixel(value) {
  if (value === null || value === undefined || value === '') return 1;
  const number = Number(value);
  if (!Number.isFinite(number) || number < MIN_BLOCKS_PER_PIXEL || number > MAX_BLOCKS_PER_PIXEL) return null;
  return number;
}

/** A layer's placement as an administrator sends it, checked; throws a 400 on a bad value. */
function normalizePlacement(raw, { partial = false } = {}) {
  const placement = {};
  if (!partial || raw.name !== undefined) placement.name = normalizeText(raw.name, 80) || 'Xaero map';
  for (const [key, field] of [['originX', 'x'], ['originZ', 'z']]) {
    const value = raw[key] ?? raw[field];
    if (partial && value === undefined) continue;
    const number = normalizeCoordinate(value);
    if (number === null) throw httpError(400, `Enter the ${field.toUpperCase()} coordinate of the image's top-left corner.`);
    placement[key] = number;
  }
  if (!partial || raw.blocksPerPixel !== undefined) {
    const blocksPerPixel = normalizeBlocksPerPixel(raw.blocksPerPixel);
    if (blocksPerPixel === null) throw httpError(400, `Blocks per pixel must be between ${MIN_BLOCKS_PER_PIXEL} and ${MAX_BLOCKS_PER_PIXEL}.`);
    placement.blocksPerPixel = blocksPerPixel;
  }
  return placement;
}

/** The deepest level of a Google-layout pyramid: the one at the image's own resolution. */
function maxZoomFor(width, height, tileSize = TILE_SIZE) {
  return Math.max(0, Math.ceil(Math.log2(Math.max(width, height) / tileSize)));
}

/** "z/y/x.webp" of a tile sharp wrote, relative to the pyramid's directory; null for anything else. */
function parseTilePath(relative) {
  const match = relative.split(path.sep).join('/').match(/^(\d{1,2})\/(\d{1,6})\/(\d{1,6})\.webp$/);
  return match ? { z: Number(match[1]), y: Number(match[2]), x: Number(match[3]) } : null;
}

function publicLayer(row) {
  return {
    id: String(row.id),
    server: row.server,
    dimension: row.dimension,
    name: row.name,
    originX: Number(row.origin_x),
    originZ: Number(row.origin_z),
    blocksPerPixel: Number(row.blocks_per_pixel),
    width: row.width,
    height: row.height,
    tileSize: row.tile_size,
    maxZoom: row.max_zoom,
    tileCount: row.tile_count,
    bytes: Number(row.bytes),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/** The request body into a file, refusing anything over the limit; the file's path. */
function receiveToFile(req, filePath, maxBytes = MAX_UPLOAD_BYTES) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > maxBytes) {
      reject(httpError(413, `The image is over ${Math.round(maxBytes / 1024 / 1024)} MB.`));
      req.resume();
      return;
    }
    const out = fs.createWriteStream(filePath);
    let received = 0;
    let failed = false;
    const fail = error => {
      if (failed) return;
      failed = true;
      out.destroy();
      reject(error);
    };
    req.on('data', chunk => {
      received += chunk.length;
      if (received > maxBytes) {
        fail(httpError(413, `The image is over ${Math.round(maxBytes / 1024 / 1024)} MB.`));
        req.destroy();
      }
    });
    req.on('error', fail);
    out.on('error', fail);
    out.on('finish', () => { if (!failed) resolve(received); });
    req.pipe(out);
  });
}

/** Cuts the PNG into WebP tiles; [{z, y, x, file}] plus the image's size. */
async function cutTiles(sourcePath, workDir) {
  const image = sharp(sourcePath, { limitInputPixels: MAX_INPUT_PIXELS });
  let metadata;
  try {
    metadata = await image.metadata();
  } catch {
    throw httpError(400, 'That file is not an image sharp can read.');
  }
  if (metadata.format !== 'png') throw httpError(400, 'Upload the PNG that Xaero\'s World Map exports.');
  if (!metadata.width || !metadata.height) throw httpError(400, 'The image is empty.');
  if (metadata.width * metadata.height > MAX_INPUT_PIXELS) {
    throw httpError(413, `The image is ${metadata.width} x ${metadata.height}; export a smaller area or a coarser scale (at most ${MAX_INPUT_PIXELS.toLocaleString('en-US')} pixels).`);
  }
  const outBase = path.join(workDir, 'tiles');
  // libvips makes it only when it writes a tile, so a fully blank image would fail without it
  fs.mkdirSync(outBase);
  // Unexplored parts of the export are transparent: tiles of nothing but that are skipped
  await image
    .ensureAlpha()
    .webp({ lossless: true, effort: 4 })
    .tile({ size: TILE_SIZE, layout: 'google', background: { r: 0, g: 0, b: 0, alpha: 0 }, skipBlanks: 0 })
    .toFile(outBase);
  const tiles = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else {
        const tile = parseTilePath(path.relative(outBase, full));
        if (tile) tiles.push({ ...tile, file: full });
      }
    }
  };
  walk(outBase);
  return { width: metadata.width, height: metadata.height, maxZoom: maxZoomFor(metadata.width, metadata.height), tiles };
}

function createXaeroMapService({ pool, recordSystemLog = async () => {}, publish = () => {}, tmpDir = os.tmpdir() }) {
  // One upload at a time: cutting a big export takes a lot of memory
  let uploading = false;

  async function listLayers(url) {
    const params = [];
    const where = [];
    const server = normalizeScopeName(url.searchParams.get('server'), 128);
    const dimension = normalizeScopeName(url.searchParams.get('dimension'), 64);
    if (server) { params.push(server); where.push(`server = $${params.length}`); }
    if (dimension) { params.push(dimension); where.push(`dimension = $${params.length}`); }
    const rows = await pool.query(
      `SELECT * FROM area_explorer_map_layers ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at, id`, params
    );
    return { layers: rows.rows.map(publicLayer) };
  }

  async function createLayer(req, currentUser, url) {
    const server = normalizeScopeName(url.searchParams.get('server'), 128);
    const dimension = normalizeScopeName(url.searchParams.get('dimension'), 64);
    if (!server || !dimension) throw httpError(400, 'Choose the server and dimension the map is of.');
    const placement = normalizePlacement({
      name: url.searchParams.get('name'),
      x: url.searchParams.get('x'),
      z: url.searchParams.get('z'),
      blocksPerPixel: url.searchParams.get('blocksPerPixel')
    });
    if (uploading) throw httpError(409, 'Another map is being processed; try again when it is done.');
    uploading = true;
    const workDir = fs.mkdtempSync(path.join(tmpDir, 'xaero-map-'));
    try {
      const sourcePath = path.join(workDir, 'source.png');
      const bytes = await receiveToFile(req, sourcePath);
      const head = Buffer.alloc(PNG_SIGNATURE.length);
      const fd = fs.openSync(sourcePath, 'r');
      try { fs.readSync(fd, head, 0, head.length, 0); } finally { fs.closeSync(fd); }
      if (bytes < PNG_SIGNATURE.length || !head.equals(PNG_SIGNATURE)) throw httpError(400, 'Upload the PNG that Xaero\'s World Map exports.');

      const { width, height, maxZoom, tiles } = await cutTiles(sourcePath, workDir);
      if (!tiles.length) throw httpError(400, 'The image is fully transparent: there is no map in it.');

      const client = await pool.connect();
      let layer;
      try {
        await client.query('BEGIN');
        layer = (await client.query(
          `INSERT INTO area_explorer_map_layers
             (server, dimension, name, origin_x, origin_z, blocks_per_pixel, width, height, tile_size, max_zoom, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
          [server, dimension, placement.name, placement.originX, placement.originZ, placement.blocksPerPixel,
            width, height, TILE_SIZE, maxZoom, currentUser.username]
        )).rows[0];
        let total = 0;
        for (let start = 0; start < tiles.length; start += TILE_INSERT_BATCH) {
          const batch = tiles.slice(start, start + TILE_INSERT_BATCH);
          const params = [layer.id];
          const values = batch.map(tile => {
            const data = fs.readFileSync(tile.file);
            total += data.length;
            params.push(tile.z, tile.x, tile.y, data);
            const at = params.length;
            return `($1, $${at - 3}, $${at - 2}, $${at - 1}, $${at})`;
          });
          await client.query(`INSERT INTO area_explorer_map_tiles (layer_id, z, x, y, data) VALUES ${values.join(', ')}`, params);
        }
        layer = (await client.query(
          'UPDATE area_explorer_map_layers SET tile_count = $2, bytes = $3 WHERE id = $1 RETURNING *', [layer.id, tiles.length, total]
        )).rows[0];
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
      await recordSystemLog({
        category: 'area_explorer', actor: currentUser.username,
        message: `Xaero map "${layer.name}" uploaded for ${server} ${dimension}: ${width} x ${height} px, ${tiles.length} tiles.`
      });
      publish('area_explorer_updated', { mapLayers: true });
      return { layer: publicLayer(layer) };
    } finally {
      uploading = false;
      await fs.promises.rm(workDir, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
    }
  }

  async function updateLayer(currentUser, id, body) {
    if (!/^\d{1,18}$/.test(id)) throw httpError(400, 'Invalid map id.');
    const placement = normalizePlacement(body || {}, { partial: true });
    const columns = { name: 'name', originX: 'origin_x', originZ: 'origin_z', blocksPerPixel: 'blocks_per_pixel' };
    const params = [id];
    const sets = Object.entries(placement).map(([key, value]) => {
      params.push(value);
      return `${columns[key]} = $${params.length}`;
    });
    if (!sets.length) throw httpError(400, 'Nothing to change.');
    const row = (await pool.query(
      `UPDATE area_explorer_map_layers SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $1 RETURNING *`, params
    )).rows[0];
    if (!row) throw httpError(404, 'Map not found.');
    await recordSystemLog({
      category: 'area_explorer', actor: currentUser.username,
      message: `Xaero map "${row.name}" moved to X ${row.origin_x} Z ${row.origin_z}, ${row.blocks_per_pixel} blocks per pixel.`
    });
    publish('area_explorer_updated', { mapLayers: true });
    return { layer: publicLayer(row) };
  }

  async function deleteLayer(currentUser, id) {
    if (!/^\d{1,18}$/.test(id)) throw httpError(400, 'Invalid map id.');
    const row = (await pool.query('DELETE FROM area_explorer_map_layers WHERE id = $1 RETURNING *', [id])).rows[0];
    if (!row) throw httpError(404, 'Map not found.');
    await recordSystemLog({ category: 'area_explorer', actor: currentUser.username, message: `Xaero map "${row.name}" deleted.` });
    publish('area_explorer_updated', { mapLayers: true });
    return { deleted: true };
  }

  async function getTile(id, z, y, x) {
    const row = (await pool.query(
      'SELECT data FROM area_explorer_map_tiles WHERE layer_id = $1 AND z = $2 AND y = $3 AND x = $4', [id, z, y, x]
    )).rows[0];
    return row ? Buffer.from(row.data) : null;
  }

  /**
   * The map routes for a signed-in user, answered on res; false for a path that isn't one of them.
   * Changing layers is for administrators only.
   */
  async function handleRequest(req, res, currentUser, url, { assertAdmin, readBody, sendJson }) {
    const route = url.pathname;
    const tileMatch = route.match(/^\/api\/area-explorer\/layers\/(\d{1,18})\/tiles\/(\d{1,2})\/(\d{1,6})\/(\d{1,6})\.webp$/);
    if (tileMatch && ['GET', 'HEAD'].includes(req.method)) {
      const [, id, z, y, x] = tileMatch;
      const data = await getTile(id, Number(z), Number(y), Number(x));
      if (!data) {
        // A blank tile, or none at all: the browser need not ask again for a while
        res.writeHead(404, { 'Cache-Control': 'private, max-age=3600' });
        res.end();
        return true;
      }
      // A layer's tiles never change: a new export is a new layer
      res.writeHead(200, {
        'Content-Type': 'image/webp', 'Content-Length': data.length,
        'Cache-Control': 'private, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff'
      });
      res.end(req.method === 'HEAD' ? undefined : data);
      return true;
    }
    if (route === '/api/area-explorer/layers' && req.method === 'GET') {
      sendJson(res, 200, await listLayers(url));
      return true;
    }
    if (route === '/api/admin/area-explorer/layers' && req.method === 'POST') {
      assertAdmin(currentUser);
      sendJson(res, 201, await createLayer(req, currentUser, url));
      return true;
    }
    const layerMatch = route.match(/^\/api\/admin\/area-explorer\/layers\/([^/]+)$/);
    if (layerMatch && req.method === 'PATCH') {
      assertAdmin(currentUser);
      sendJson(res, 200, await updateLayer(currentUser, layerMatch[1], await readBody(req)));
      return true;
    }
    if (layerMatch && req.method === 'DELETE') {
      assertAdmin(currentUser);
      sendJson(res, 200, await deleteLayer(currentUser, layerMatch[1]));
      return true;
    }
    return false;
  }

  return { handleRequest, listLayers, createLayer, updateLayer, deleteLayer, getTile };
}

module.exports = {
  createXaeroMapService,
  cutTiles,
  maxZoomFor,
  normalizePlacement,
  parseTilePath,
  publicLayer,
  TILE_SIZE
};
