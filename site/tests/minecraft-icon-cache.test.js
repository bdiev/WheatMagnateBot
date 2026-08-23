'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  MinecraftIconCache,
  minecraftIconEtag,
  normalizeMinecraftAssetId,
  validPng
} = require('../minecraft-icon-cache');

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('test-image')
]);

function pngResponse(body = png) {
  return {
    ok: true,
    status: 200,
    headers: { get: name => name.toLowerCase() === 'content-type' ? 'image/png' : String(body.length) },
    arrayBuffer: async () => body
  };
}

async function run() {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wm-minecraft-icons-'));
  try {
    assert.equal(normalizeMinecraftAssetId('minecraft:WITCH'), 'witch');
    assert.equal(normalizeMinecraftAssetId('../witch'), null);
    assert.equal(validPng(png), true);
    assert.equal(validPng(Buffer.from('not-png')), false);
    assert.match(minecraftIconEtag(png), /^"[A-Za-z0-9_-]+"$/);

    const fetchedUrls = [];
    const cache = new MinecraftIconCache({
      cacheDir,
      fetchImpl: async url => {
        fetchedUrls.push(url);
        return pngResponse();
      }
    });
    const first = await cache.get('mob', 'witch');
    assert.equal(first.cacheStatus, 'MISS');
    assert.equal(fetchedUrls[0], 'https://mc-api.bisai.dev/v1/mobs/witch/image.png');
    assert.deepEqual(first.body, png);

    const second = await cache.get('mob', 'witch');
    assert.equal(second.cacheStatus, 'HIT');
    assert.equal(fetchedUrls.length, 1, 'a fresh icon must be served without another provider request');

    const item = await cache.get('item', 'diamond_sword');
    assert.equal(item.cacheStatus, 'MISS');
    assert.equal(fetchedUrls[1], 'https://mc-api.bisai.dev/v1/assets/items/diamond_sword/texture.png');

    const witchPath = path.join(cacheDir, 'mob', 'witch.png');
    fs.utimesSync(witchPath, new Date(0), new Date(0));
    const staleCache = new MinecraftIconCache({
      cacheDir,
      ttlMs: 60_000,
      fetchImpl: async () => { throw new Error('offline'); }
    });
    const stale = await staleCache.get('mob', 'witch');
    assert.equal(stale.cacheStatus, 'STALE');
    assert.deepEqual(stale.body, png, 'a cached icon must survive a provider outage');

    await assert.rejects(() => cache.get('mob', '../witch'), error => error.statusCode === 400);
    await assert.rejects(
      () => new MinecraftIconCache({ cacheDir: path.join(cacheDir, 'invalid'), fetchImpl: async () => pngResponse(Buffer.from('html')) }).get('mob', 'zombie'),
      error => error.statusCode === 502
    );
  } finally {
    const resolved = path.resolve(cacheDir);
    assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep));
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}

run()
  .then(() => console.log('Minecraft icon cache tests passed.'))
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
