'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const sharp = require('sharp');
const { PGlite } = require('@electric-sql/pglite');
const { createXaeroRegionMapService, parentOf, parentTileFromChildren, tileInRange, MAX_DISTANCE, MAX_LEVEL, REGION_PX } = require('../xaero-region-map');

const migrationSql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '069_area_explorer_region_map.sql'), 'utf8');
const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const appSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

const DRAWN = Date.UTC(2026, 9, 5, 12, 0, 0);

function poolFor(db) {
  const query = async (sql, params) => db.query(sql, params);
  return { query, connect: async () => ({ query, release() {} }) };
}

function recordingResponse() {
  return {
    statusCode: 0, headers: {}, body: null, headersSent: false,
    writeHead(statusCode, headers = {}) { this.statusCode = statusCode; this.headers = headers; this.headersSent = true; },
    end(body) { this.body = body ?? null; }
  };
}

function request(method, body = null, headers = {}) {
  const stream = Readable.from(body ? [body] : []);
  return Object.assign(stream, { method, headers: { ...headers, ...(body ? { 'content-length': String(body.length) } : {}) } });
}

/** A region PNG: a green square in the top-left quarter, the rest undrawn. */
async function regionPng({ fill = true } = {}) {
  const pixels = Buffer.alloc(REGION_PX * REGION_PX * 4);
  if (fill) {
    for (let y = 0; y < REGION_PX / 2; y++) {
      for (let x = 0; x < REGION_PX / 2; x++) pixels.set([40, 140, 60, 255], (y * REGION_PX + x) * 4);
    }
  }
  return sharp(pixels, { raw: { width: REGION_PX, height: REGION_PX, channels: 4 } }).png().toBuffer();
}

function testHelpers() {
  assert.deepEqual(parentOf(0, 5, -3), { level: 1, x: 2, z: -2 }, 'negative regions round down, like Xaero');
  assert.deepEqual(parentOf(3, -1, 0), { level: 4, x: -1, z: 0 });
}

async function testParentShrinks() {
  const child = await sharp({ create: { width: REGION_PX, height: REGION_PX, channels: 4, background: { r: 200, g: 10, b: 10, alpha: 1 } } }).webp({ lossless: true }).toBuffer();
  const tile = await parentTileFromChildren([{ dx: 1, dz: 0, data: child }]);
  const { data, info } = await sharp(tile).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, REGION_PX);
  const at = (x, y) => [...data.subarray((y * REGION_PX + x) * 4, (y * REGION_PX + x) * 4 + 4)];
  assert.equal(at(10, 10)[3], 0, 'the quarter without a child stays clear');
  assert.ok(at(400, 100)[0] > 180 && at(400, 100)[3] === 255, 'the child lands in its quarter, half size');
  assert.equal(at(400, 400)[3], 0);
  assert.equal(await parentTileFromChildren([]), null);
}

async function testService() {
  const db = new PGlite();
  try {
    await db.exec(migrationSql);
    const published = [];
    let limited = false;
    const sendJson = (res, statusCode, payload) => { res.writeHead(statusCode, {}); res.end(JSON.stringify(payload)); };
    const service = createXaeroRegionMapService({
      pool: poolFor(db),
      authenticate: async req => (req.headers.authorization === 'Bearer good' ? { id: 7, name: 'PC' } : null),
      enforceRateLimit: () => !limited,
      sendJson,
      sendError: (res, statusCode, message) => sendJson(res, statusCode, { error: message }),
      publish: (type, payload) => published.push({ type, payload }),
      maxBytes: 10 * 1024 * 1024
    });
    const modUrl = (x, z, modified = DRAWN) => new URL(`http://localhost/api/area-explorer/mod/map/regions/${x}/${z}?server=Oldfrog.org&dimension=overworld&modified=${modified}`);
    const auth = { authorization: 'Bearer good' };
    const png = await regionPng();

    let res = recordingResponse();
    assert.equal(await service.handleModRequest(request('PUT', png), res, modUrl(-3, 2)), true);
    assert.equal(res.statusCode, 401, 'the mod needs its token');

    res = recordingResponse();
    await service.handleModRequest(request('PUT', png, auth), res, modUrl(-3, 2));
    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(res.body), { stored: true });

    res = recordingResponse();
    await service.handleModRequest(request('PUT', png, auth), res, modUrl(-3, 2, DRAWN - 1000));
    assert.deepEqual(JSON.parse(res.body), { stored: false, reason: 'up to date' }, 'an older drawing does not replace a newer one');

    res = recordingResponse();
    await service.handleModRequest(request('GET', null, auth), res, new URL('http://localhost/api/area-explorer/mod/map/regions?server=oldfrog.org&dimension=overworld'));
    assert.deepEqual(JSON.parse(res.body), { regions: [[-3, 2, DRAWN]] }, 'the mod learns what the site has');

    await assert.rejects(service.handleModRequest(request('PUT', Buffer.from('nope'), auth), recordingResponse(), modUrl(0, 0)), /PNG/);
    const small = await sharp({ create: { width: 64, height: 64, channels: 4, background: '#000' } }).png().toBuffer();
    await assert.rejects(service.handleModRequest(request('PUT', small, auth), recordingResponse(), modUrl(0, 0)), /512 x 512/);
    await assert.rejects(service.handleModRequest(request('PUT', png, auth), recordingResponse(), modUrl(0, 0, 5)), /modified/);
    // Only ±100k around 0, 0: region 195 reaches into it (to X 99,840), 196 doesn't
    await assert.rejects(service.handleModRequest(request('PUT', png, auth), recordingResponse(), modUrl(196, 0)), /within 100000 blocks/);
    await assert.rejects(service.handleModRequest(request('PUT', png, auth), recordingResponse(), modUrl(0, -197)), /within 100000 blocks/);
    assert.equal(tileInRange(0, 195), true);
    assert.equal(tileInRange(0, -196), true);
    assert.equal(tileInRange(0, -197), false);
    assert.equal(tileInRange(MAX_LEVEL, -1), true, 'the top level is four tiles');
    assert.equal(tileInRange(MAX_LEVEL, 1), false);

    // The whole pyramid above the region, a level at a time
    while (await service.processDirty({ settleMs: 0 }) || (await db.query('SELECT 1 FROM area_explorer_region_dirty')).rows.length) { /* keep going */ }
    const levels = (await db.query('SELECT level, x, z FROM area_explorer_region_tiles ORDER BY level')).rows;
    assert.equal(levels.length, MAX_LEVEL + 1, 'a tile on every level up to the top');
    assert.deepEqual(levels.slice(0, 3).map(row => [row.level, row.x, row.z]), [[0, -3, 2], [1, -2, 1], [2, -1, 0]]);

    const { regions, maxLevel } = await service.mapIndex({ server: 'oldfrog.org', dimension: 'overworld' });
    assert.deepEqual(regions, [-3, 2]);
    assert.equal(maxLevel, MAX_LEVEL);
    assert.deepEqual((await service.mapScopes()).scopes.map(scope => [scope.server, scope.dimension, scope.regions]), [['oldfrog.org', 'overworld', 1]]);
    assert.equal((await service.mapScopes()).scopes[0].night, false);

    // The night view: kept as a dimension of its own, listed as the overworld's night
    await service.putRegion({ server: 'oldfrog.org', dimension: 'overworld@night' }, -3, 2, DRAWN, await regionPng());
    const withNight = (await service.mapScopes()).scopes;
    assert.deepEqual(withNight.map(scope => [scope.dimension, scope.night]), [['overworld', true]], 'not a dimension of its own in the list');
    assert.deepEqual((await service.mapIndex({ server: 'oldfrog.org', dimension: 'overworld@night' })).regions, [-3, 2]);
    await db.query(`DELETE FROM area_explorer_region_tiles WHERE dimension = 'overworld@night'`);
    await db.query(`DELETE FROM area_explorer_region_dirty WHERE dimension = 'overworld@night'`);

    const tileUrl = new URL('http://localhost/api/area-explorer/map/tiles/1/-2/1.webp?server=oldfrog.org&dimension=overworld');
    res = recordingResponse();
    assert.equal(await service.handleRequest(request('GET'), res, tileUrl), true);
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['Content-Type'], 'image/webp');
    assert.match(res.headers['Cache-Control'], /no-cache/, 'the browser checks back: tiles change as the map is drawn');
    const etag = res.headers.ETag;
    res = recordingResponse();
    await service.handleRequest(request('GET', null, { 'if-none-match': etag }), res, tileUrl);
    assert.equal(res.statusCode, 304);
    res = recordingResponse();
    await service.handleRequest(request('GET'), res, new URL('http://localhost/api/area-explorer/map/tiles/0/50/50.webp?server=oldfrog.org&dimension=overworld'));
    assert.equal(res.statusCode, 404);
    res = recordingResponse();
    await service.handleRequest(request('GET'), res, new URL('http://localhost/api/area-explorer/map/tiles/2/60/0.webp?server=oldfrog.org&dimension=overworld'));
    assert.equal(res.statusCode, 404, 'a tile past the square is not even looked up');
    assert.match(res.headers['Cache-Control'], /max-age=86400/);

    service.flushPublish();
    const mapEvent = published.find(event => event.payload.mapTiles);
    assert.equal(mapEvent.type, 'area_explorer_updated');
    assert.deepEqual(mapEvent.payload.mapTiles.tiles[0], [0, -3, 2], 'open dashboards hear which tiles changed');

    // A region redrawn blank goes, and so do the tiles above it
    res = recordingResponse();
    await service.handleModRequest(request('PUT', await regionPng({ fill: false }), auth), res, modUrl(-3, 2, DRAWN + 1000));
    assert.deepEqual(JSON.parse(res.body), { stored: false });
    while (await service.processDirty({ settleMs: 0 }) || (await db.query('SELECT 1 FROM area_explorer_region_dirty')).rows.length) { /* keep going */ }
    assert.equal((await db.query(`SELECT COUNT(*)::int AS count FROM area_explorer_region_tiles WHERE dimension = 'overworld'`)).rows[0].count, 0);

    // Full storage refuses new regions
    const tight = createXaeroRegionMapService({
      pool: poolFor(db), authenticate: async () => ({ id: 1 }), enforceRateLimit: () => true, sendJson, sendError() {}, maxBytes: 1
    });
    await tight.putRegion({ server: 'a', dimension: 'overworld' }, 0, 0, DRAWN, png);
    await assert.rejects(tight.putRegion({ server: 'a', dimension: 'overworld' }, 1, 0, DRAWN, png), error => error.statusCode === 507);
    service.stop();
    tight.stop();
  } finally {
    await db.close();
  }
}

function testWiring() {
  assert.match(serverSource, /url\.pathname\.startsWith\('\/api\/area-explorer\/mod\/'\)/, 'the mod routes skip the browser checks, like ingest');
  assert.ok(
    serverSource.indexOf("url.pathname.startsWith('/api/area-explorer/mod/')") < serverSource.indexOf('const origin = validateOrigin('),
    'before the origin and CSRF checks'
  );
  assert.match(serverSource, /getXaeroRegionMapService\(\)\.handleRequest\(req, res, url\)/);
  assert.match(serverSource, /if \(pool\) getXaeroRegionMapService\(\)\.start\(\);/);
  assert.match(appSource, /\/api\/area-explorer\/map\/tiles\/\$\{level\}\/\$\{x\}\/\$\{z\}\.webp/);
  assert.match(appSource, /drawXaeroRegionMap\(ctx, canvas, view, ratio\);/);
  // The territory: ±30k, ±50k or ±100k around 0, 0 - from -30,000 to 30,000 each way - and no more
  assert.match(appSource, /const AREA_EXPLORER_RADII = Object\.freeze\(\[30_000, 50_000, 100_000\]\);/);
  assert.deepEqual([...indexSource.matchAll(/data-area-radius="(\d+)"/g)].map(match => Number(match[1])), [30_000, 50_000, 100_000]);
  assert.match(appSource, /ae\.extent = 2 \* Number\(button\.dataset\.areaRadius\)/, 'the square is twice the radius a side');
  assert.equal(MAX_DISTANCE, 100_000, 'the site keeps no more than the largest territory');
  assert.match(appSource, /const half = areaExplorerState\(\)\.extent \/ 2;\s+const left = Math\.max\(-half/, 'tiles are only asked for inside the territory');
}

(async () => {
  testHelpers();
  await testParentShrinks();
  await testService();
  testWiring();
  console.log('xaero-region-map tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
