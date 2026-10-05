'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');
const sharp = require('sharp');
const { PGlite } = require('@electric-sql/pglite');
const { createXaeroMapService, maxZoomFor, normalizePlacement, parseTilePath } = require('../xaero-map');

const migrationSql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '068_area_explorer_map_layers.sql'), 'utf8');
const indexSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const appSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

const ADMIN = { username: 'admin', role: 'admin' };

/** PGlite behind the slice of pg's Pool the service uses. */
function poolFor(db) {
  const query = async (sql, params) => db.query(sql, params);
  return { query, connect: async () => ({ query, release() {} }) };
}

function uploadRequest(body) {
  return Object.assign(Readable.from([body]), { method: 'POST', headers: { 'content-length': String(body.length) } });
}

/** A response that keeps what was written to it. */
function recordingResponse() {
  return {
    statusCode: 0, headers: {}, body: null,
    writeHead(statusCode, headers = {}) { this.statusCode = statusCode; this.headers = headers; },
    end(body) { this.body = body ?? null; }
  };
}

function testHelpers() {
  assert.equal(maxZoomFor(256, 256), 0, 'a single tile is level 0');
  assert.equal(maxZoomFor(257, 10), 1);
  assert.equal(maxZoomFor(1300, 700), 3);
  assert.deepEqual(parseTilePath(path.join('3', '2', '5.webp')), { z: 3, y: 2, x: 5 });
  assert.equal(parseTilePath('blank.png'), null);
  assert.equal(parseTilePath(path.join('..', '1', '1.webp')), null);

  assert.deepEqual(normalizePlacement({ name: ' Spawn ', x: '-1024', z: '512.5', blocksPerPixel: '2' }),
    { name: 'Spawn', originX: -1024, originZ: 512.5, blocksPerPixel: 2 });
  assert.equal(normalizePlacement({ x: 0, z: 0 }).blocksPerPixel, 1, 'one block per pixel unless told otherwise');
  assert.throws(() => normalizePlacement({ x: '', z: 0 }), /X coordinate/);
  assert.throws(() => normalizePlacement({ x: 0, z: 40_000_000 }), /Z coordinate/);
  assert.throws(() => normalizePlacement({ x: 0, z: 0, blocksPerPixel: 0 }), /Blocks per pixel/);
  assert.deepEqual(normalizePlacement({ originX: 5 }, { partial: true }), { originX: 5 }, 'a correction changes only what it names');
}

async function testUploadAndTiles() {
  const db = new PGlite();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xaero-map-test-'));
  try {
    await db.exec(migrationSql);
    const published = [];
    const logs = [];
    const service = createXaeroMapService({
      pool: poolFor(db), tmpDir,
      recordSystemLog: async entry => { logs.push(entry); },
      publish: (type, payload) => published.push({ type, payload })
    });

    // 600 x 300: explored on the left, the right third transparent like an unexplored part of an export
    const width = 600, height = 300;
    const pixels = Buffer.alloc(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < 400; x++) pixels.set([40, 140, 60, 255], (y * width + x) * 4);
    }
    const png = await sharp(pixels, { raw: { width, height, channels: 4 } }).png().toBuffer();
    const url = new URL('http://localhost/api/admin/area-explorer/layers?server=Example.org&dimension=Overworld&name=Spawn&x=-512&z=-256');
    const { layer } = await service.createLayer(uploadRequest(png), ADMIN, url);
    assert.equal(layer.server, 'example.org', 'scopes are lower case, like the finds');
    assert.equal(layer.dimension, 'overworld');
    assert.equal(layer.originX, -512);
    assert.equal(layer.blocksPerPixel, 1);
    assert.equal(layer.width, 600);
    assert.equal(layer.maxZoom, 2);
    // Level 2: 3 x 2 tiles, the column past x = 512 blank; level 1: 2 x 1, the right one blank; level 0: one
    assert.equal(layer.tileCount, 4 + 1 + 1, 'blank tiles are not stored');
    assert.ok(layer.bytes > 0);
    assert.deepEqual(published.map(event => event.type), ['area_explorer_updated']);
    assert.match(logs[0].message, /Spawn.*600 x 300 px/);
    assert.deepEqual(fs.readdirSync(tmpDir), [], 'the work directory is removed');

    const tile = await service.getTile(layer.id, 2, 0, 1);
    assert.ok(tile, 'a tile of the explored part is there');
    const tileInfo = await sharp(tile).metadata();
    assert.equal(tileInfo.format, 'webp');
    assert.equal(tileInfo.width, 256);
    assert.equal(await service.getTile(layer.id, 2, 0, 2), null, 'the unexplored corner has no tile');

    const res = recordingResponse();
    const handled = await service.handleRequest({ method: 'GET' }, res, ADMIN,
      new URL(`http://localhost/api/area-explorer/layers/${layer.id}/tiles/0/0/0.webp`), { assertAdmin() {}, readBody: async () => ({}), sendJson() {} });
    assert.equal(handled, true);
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['Content-Type'], 'image/webp');
    assert.match(res.headers['Cache-Control'], /immutable/, 'a layer never changes its tiles');

    const { layers } = await service.listLayers(new URL('http://localhost/api/area-explorer/layers?server=example.org'));
    assert.equal(layers.length, 1);
    assert.equal((await service.listLayers(new URL('http://localhost/api/area-explorer/layers?dimension=the_end'))).layers.length, 0);

    const moved = await service.updateLayer(ADMIN, layer.id, { originX: -500, originZ: '-250' });
    assert.equal(moved.layer.originX, -500);
    assert.equal(moved.layer.originZ, -250);
    assert.equal(moved.layer.name, 'Spawn', 'aligning keeps the name');
    await assert.rejects(service.updateLayer(ADMIN, layer.id, {}), /Nothing to change/);
    await assert.rejects(service.updateLayer(ADMIN, '999', { originX: 1 }), /not found/);

    await assert.rejects(service.createLayer(uploadRequest(Buffer.from('not a png at all')), ADMIN, url), /PNG/);
    const empty = await sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    await assert.rejects(service.createLayer(uploadRequest(empty), ADMIN, url), /fully transparent/);
    await assert.rejects(service.createLayer(uploadRequest(png), ADMIN, new URL('http://localhost/x?server=a&x=0&z=0')), /server and dimension/);

    await service.deleteLayer(ADMIN, layer.id);
    assert.equal((await db.query('SELECT COUNT(*)::int AS count FROM area_explorer_map_tiles')).rows[0].count, 0, 'its tiles go with it');
  } finally {
    await db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function testWiring() {
  assert.match(serverSource, /require\('\.\/xaero-map'\)/);
  assert.match(serverSource, /getXaeroMapService\(\)\.handleRequest\(req, res, currentUser, url/);
  for (const id of ['areaExplorerShowXaero', 'areaExplorerCursor', 'areaExplorerAlignHint', 'xaeroMapForm', 'xaeroMapFile', 'xaeroMapLayers']) {
    assert.ok(indexSource.includes(`id="${id}"`), `${id} is on the page`);
  }
  assert.match(indexSource, /class="panel xaero-map-panel admin-only" hidden/, 'only administrators upload maps');
  assert.match(appSource, /\/api\/area-explorer\/layers\/\$\{encodeURIComponent\(layer\.id\)\}\/tiles\/\$\{z\}\/\$\{y\}\/\$\{x\}\.webp/);
  assert.match(appSource, /if \(ae\.showXaero\) drawXaeroMapLayers\(ctx, canvas, view, ratio\);/, 'the map is drawn under the grid and the finds');
  assert.match(appSource, /setupXaeroMap\(\);/);
}

(async () => {
  testHelpers();
  await testUploadAndTiles();
  testWiring();
  console.log('xaero-map tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
