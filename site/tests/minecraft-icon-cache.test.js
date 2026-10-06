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

/** An icon the provider doesn't have is remembered as missing for a while: no request per page view. */
async function missingIcons() {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wm-minecraft-icons-'));
  try {
    let time = 1_000_000;
    let asked = 0;
    const cache = new MinecraftIconCache({
      cacheDir, now: () => time, missingTtlMs: 60_000,
      fetchImpl: async () => { asked++; return { ok: false, status: 404, headers: { get: () => null } }; }
    });
    await assert.rejects(cache.get('item', 'ward_armor_trim'), error => error.statusCode === 404);
    await assert.rejects(cache.get('item', 'ward_armor_trim'), error => error.statusCode === 404);
    assert.equal(asked, 1, 'the second time is answered from memory');
    time += 61_000;
    await assert.rejects(cache.get('item', 'ward_armor_trim'), error => error.statusCode === 404);
    assert.equal(asked, 2, 'and asked again once that has run out');
  } finally {
    fs.rmSync(cacheDir, { recursive: true, force: true });
  }
}

/** Names the game shows whose ids are something else, from minecraft-data. */
function itemNameIds() {
  const names = require('../item-name-ids.json');
  assert.equal(names.ward_armor_trim, 'ward_armor_trim_smithing_template');
  assert.equal(names.netherite_upgrade, 'netherite_upgrade_smithing_template');
  assert.equal(names.map, 'filled_map');
  assert.equal(names.book_and_quill, 'writable_book');
  assert.equal(names.eye_of_ender, 'ender_eye');
  assert.equal(names.elytra, undefined, 'only names that differ from the id');
}

run()
  .then(missingIcons)
  .then(itemNameIds)
  .then(() => console.log('Minecraft icon cache tests passed.'))
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
