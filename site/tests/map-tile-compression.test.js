'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');
const { PGlite } = require('@electric-sql/pglite');
const { compressStoredTile, encodeRegionTile, sameTilePixels } = require('../map-tile-compression');
const { optimizeMapTiles, replaceTile } = require('../optimize-map-tiles');

(async () => {
  const info = { width: 512, height: 512, channels: 4 };
  const pixels = Buffer.alloc(512 * 512 * 4);
  for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
    const at = (y * 512 + x) * 4;
    pixels.set([(x * 3) % 256, y % 256, (x + y) % 256, x < 128 ? 0 : 255], at);
  }
  const png = await sharp(pixels, { raw: info }).png({ compressionLevel: 0 }).toBuffer();
  const encoded = await encodeRegionTile(pixels, info);
  const raw = await sharp(encoded).ensureAlpha().raw().toBuffer();
  assert.deepEqual(raw, pixels, 'even hidden RGB in transparent pixels survives');
  const baseline = await sharp(pixels, { raw: info }).webp({ lossless: true, effort: 4, exact: true }).toBuffer();
  assert.ok(encoded.length <= baseline.length, 'new writes never exceed the baseline encoder');
  const smaller = await compressStoredTile(png);
  assert.ok(smaller.length < png.length);
  assert.equal(await sameTilePixels(png, smaller), true);
  const again = await compressStoredTile(smaller);
  assert.equal(again, smaller, 'an equal-size result keeps the original bytes');
  const lossy = await sharp(png).webp({ quality: 88 }).toBuffer();
  const repackedLossy = await compressStoredTile(lossy);
  assert.ok(repackedLossy.length <= lossy.length);
  assert.equal(await sameTilePixels(lossy, repackedLossy), true, 'maintenance adds no loss even to existing lossy tiles');

  const db = new PGlite();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'map-compression-test-'));
  const stateFile = path.join(directory, 'progress.json');
  try {
    await db.exec(fs.readFileSync(path.join(__dirname, '../migrations/069_area_explorer_region_map.sql'), 'utf8'));
    const client = { query: async (sql, params) => {
      // PGlite is single-process and lacks the session advisory lock functions.
      if (sql.startsWith('SELECT pg_try_advisory_lock')) return { rows: [{ locked: true }] };
      if (sql.startsWith('SELECT pg_advisory_unlock')) return { rows: [{}] };
      const result = await db.query(sql, params);
      return { ...result, rowCount: result.affectedRows ?? result.rows.length };
    } };
    for (const [x, level] of [[-1, 0], [0, 0], [1, 1]]) {
      await db.query(`INSERT INTO area_explorer_region_tiles (server,dimension,level,x,z,data,source_modified_at,updated_at)
        VALUES ('test','overworld',$1,$2,0,$3,'2026-01-01T00:00:00Z','2026-01-02T00:00:00Z')`, [level, x, png]);
    }
    const quiet = () => {};
    const dry = await optimizeMapTiles(client, { limit: 1, delayMs: 0, log: quiet });
    assert.equal(dry.replaced, 1);
    assert.deepEqual(Buffer.from((await db.query('SELECT data FROM area_explorer_region_tiles WHERE x=-1')).rows[0].data), png);
    assert.equal(fs.existsSync(stateFile), false);
    const first = await optimizeMapTiles(client, { apply: true, limit: 1, delayMs: 0, stateFile, log: quiet });
    assert.equal(first.replaced, 1);
    const resumed = await optimizeMapTiles(client, { apply: true, limit: Infinity, delayMs: 0, stateFile, log: quiet });
    assert.equal(resumed.complete, true);
    assert.equal(resumed.scanned, 2);
    assert.equal(resumed.replaced, 2);
    const rows = (await db.query('SELECT level,data,source_modified_at,updated_at FROM area_explorer_region_tiles ORDER BY x')).rows;
    for (const row of rows) {
      assert.equal(await sameTilePixels(png, Buffer.from(row.data)), true);
      assert.equal(new Date(row.updated_at).toISOString(), '2026-01-02T00:00:00.000Z');
      assert.equal(new Date(row.source_modified_at).toISOString(), '2026-01-01T00:00:00.000Z');
    }
    assert.deepEqual(Buffer.from(rows[2].data), png, 'upper zoom levels stay untouched');
    const stale = { server: 'test', dimension: 'overworld', x: -1, z: 0, data: png };
    assert.equal(await replaceTile(client, stale, smaller), false, 'a concurrent replacement cannot be overwritten');
  } finally {
    await db.close();
    fs.rmSync(stateFile, { force: true });
    fs.rmdirSync(directory);
  }
  console.log('map-tile-compression tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
