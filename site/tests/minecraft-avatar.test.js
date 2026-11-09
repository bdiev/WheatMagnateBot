'use strict';

const assert = require('node:assert/strict');
const sharp = require('sharp');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createMinecraftAvatarLoader, minecraftAvatarSources, renderOfficialMinecraftAvatar } = require('../minecraft-avatar');

const sources = minecraftAvatarSources('moooomoooo');

assert.equal(sources.at(-1), 'https://mc-heads.net/avatar/moooomoooo/64/slim');
assert.ok(!sources.some(source => source.includes('/head/')), 'profile avatars must never use a 3D head renderer');
assert.equal(
  minecraftAvatarSources('player name').at(-1),
  'https://mc-heads.net/avatar/player%20name/64/slim',
  'avatar identities must be URL encoded'
);

async function run() {
  const pixels = Buffer.alloc(64 * 64 * 4);
  for (let y = 8; y < 16; y += 1) {
    for (let x = 8; x < 16; x += 1) {
      const offset = (y * 64 + x) * 4;
      pixels.set([255, 0, 0, 255], offset);
    }
  }
  pixels.set([0, 0, 255, 255], (8 * 64 + 40) * 4);
  const skin = await sharp(pixels, { raw: { width: 64, height: 64, channels: 4 } }).png().toBuffer();
  const texturePayload = Buffer.from(JSON.stringify({
    textures: { SKIN: { url: 'http://textures.minecraft.net/texture/test-skin' } }
  })).toString('base64');
  const requested = [];
  const avatar = await renderOfficialMinecraftAvatar({
    username: 'moooomoooo',
    uuid: 'ddac152907294791aa72d82960ed8580',
    fetchImpl: async url => {
      requested.push(String(url));
      if (String(url).includes('sessionserver.mojang.com')) {
        return { ok: true, json: async () => ({ properties: [{ name: 'textures', value: texturePayload }] }) };
      }
      return { ok: true, arrayBuffer: async () => skin };
    }
  });
  const { data, info } = await sharp(avatar).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.deepEqual([info.width, info.height], [64, 64]);
  assert.deepEqual([...data.subarray(0, 4)], [0, 0, 255, 255], 'the outer face layer must be composited');
  assert.deepEqual([...data.subarray(8 * 4, 9 * 4)], [255, 0, 0, 255], 'the base face must remain visible');
  assert.equal(requested.at(-1), 'https://textures.minecraft.net/texture/test-skin');

  const directRequests = [];
  const direct = await renderOfficialMinecraftAvatar({ textureHash: 'test-skin', fetchImpl: async url => {
    directRequests.push(url);
    return new Response(skin, { headers: { 'content-type': 'image/png' } });
  } });
  assert.deepEqual(direct, avatar, 'a stored texture renders the same head without any profile service');
  assert.deepEqual(directRequests, ['https://textures.minecraft.net/texture/test-skin']);
  await assert.rejects(renderOfficialMinecraftAvatar({ textureHash: '../invalid', fetchImpl: async () => assert.fail('invalid hashes must not be fetched') }), /Invalid Minecraft skin hash/);

  const offlineUuid = '1234567890ab3def1234567890abcdef';
  const officialUuid = 'ddac152907294791aa72d82960ed8580';
  const recoveredRequests = [];
  const recovered = await renderOfficialMinecraftAvatar({ username: 'TestPlayer', uuid: offlineUuid, fetchImpl: async url => {
    recoveredRequests.push(url);
    if (url.endsWith(offlineUuid)) return new Response('', { status: 404 });
    if (url.includes('api.mojang.com')) return Response.json({ id: officialUuid });
    if (url.includes('sessionserver.mojang.com')) return Response.json({ properties: [{ name: 'textures', value: texturePayload }] });
    return new Response(skin);
  } });
  assert.deepEqual(recovered, avatar, 'a server UUID missing from Mojang is resolved by the player name');
  assert.equal(recoveredRequests[1], 'https://api.mojang.com/users/profiles/minecraft/TestPlayer');
  assert.equal(recoveredRequests[2], `https://sessionserver.mojang.com/session/minecraft/profile/${officialUuid}`);
  let rateLimitedCalls = 0;
  await assert.rejects(renderOfficialMinecraftAvatar({ username: 'TestPlayer', uuid: officialUuid, fetchImpl: async () => {
    rateLimitedCalls += 1;
    return new Response('', { status: 429 });
  } }), { statusCode: 429 });
  assert.equal(rateLimitedCalls, 1, 'rate limiting must not trigger another identity lookup');

  let parallelCalls = 0;
  const loadParallel = createMinecraftAvatarLoader({ fetchImpl: async url => {
    parallelCalls += 1;
    if (url.includes('sessionserver.mojang.com')) return Response.json({ properties: [{ name: 'textures', value: texturePayload }] });
    return new Response(skin);
  } });
  const parallel = await Promise.all(Array.from({ length: 20 }, () => loadParallel({ username: 'TestPlayer', uuid: officialUuid })));
  assert.equal(parallelCalls, 2, 'twenty simultaneous heads share one profile request and one texture request');
  assert.ok(parallel.every(entry => entry.verified && entry.body.equals(avatar)));
  await loadParallel({ username: 'TestPlayer', uuid: officialUuid, textureHash: 'skin-one' });
  await loadParallel({ username: 'TestPlayer', uuid: officialUuid, textureHash: 'skin-one' });
  assert.equal(parallelCalls, 3, 'the stored texture is cached without a profile request');
  await loadParallel({ username: 'TestPlayer', uuid: officialUuid, textureHash: 'skin-two' });
  assert.equal(parallelCalls, 4, 'a changed texture bypasses the old head cache immediately');

  const fallbackPixels = Buffer.alloc(64 * 64 * 4);
  for (let i = 0; i < 64 * 64; i += 1) fallbackPixels.set([i % 256, Math.floor(i / 64) * 4, (i * 31) % 256, 255], i * 4);
  const fallbackPng = await sharp(fallbackPixels, { raw: { width: 64, height: 64, channels: 4 } }).png().toBuffer();
  assert.ok(fallbackPng.length >= 250);
  let time = 0;
  let officialAvailable = false;
  let fallbackCalls = 0;
  const loadRecovering = createMinecraftAvatarLoader({ now: () => time, ttlMs: 100, fallbackTtlMs: 20,
    fetchImpl: async url => {
      if (url.includes('sessionserver.mojang.com')) {
        return officialAvailable ? Response.json({ properties: [{ name: 'textures', value: texturePayload }] }) : new Response('', { status: 503 });
      }
      if (url.includes('textures.minecraft.net')) return new Response(skin);
      fallbackCalls += 1;
      return new Response(fallbackPng, { headers: { 'content-type': 'image/png' } });
    }
  });
  const fallback = await loadRecovering({ username: 'TestPlayer', uuid: officialUuid });
  assert.equal(fallback.verified, false);
  time = 21;
  officialAvailable = true;
  const restored = await loadRecovering({ username: 'TestPlayer', uuid: officialUuid });
  assert.equal(restored.verified, true, 'fallback heads are refreshed promptly instead of lasting six hours');
  assert.deepEqual(restored.body, avatar);
  time = 122;
  officialAvailable = false;
  const stale = await loadRecovering({ username: 'TestPlayer', uuid: officialUuid });
  assert.deepEqual(stale.body, avatar, 'a later profile outage keeps the verified head');
  assert.equal(fallbackCalls, 1, 'an outage must not replace a verified head with a fallback Steve');

  let failedCalls = 0;
  const loadKnownFailure = createMinecraftAvatarLoader({ fetchImpl: async url => {
    failedCalls += 1;
    assert.equal(url, 'https://textures.minecraft.net/texture/known-skin');
    throw new Error('CDN unavailable');
  } });
  await assert.rejects(loadKnownFailure({ username: 'TestPlayer', textureHash: 'known-skin' }), { statusCode: 502 });
  await assert.rejects(loadKnownFailure({ username: 'TestPlayer', textureHash: 'known-skin' }), { statusCode: 502 });
  assert.equal(failedCalls, 1, 'known skins never fall through to default renderers, and failures have a retry cooldown');

  const serverSource = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  const handlerSource = serverSource.slice(serverSource.indexOf('async function sendMinecraftAvatar('), serverSource.indexOf('async function readPlayerSkinHistory('));
  const routed = [];
  const route = vm.runInNewContext(`${handlerSource}; sendMinecraftAvatar`, {
    pool: { query: async sql => ({ rows: sql.includes('FROM player_activity')
      ? [{ username: 'TestPlayer', player_uuid: 'ddac1529-0729-4791-aa72-d82960ed8580' }]
      : [{ texture_hash: 'stored-skin' }] }) },
    loadMinecraftAvatar: async identity => { routed.push(identity); return { body: avatar }; },
    sendError: () => assert.fail('the saved skin should render successfully')
  });
  let responseBody;
  await route({ writeHead: status => assert.equal(status, 200), end: body => { responseBody = body; } }, new URL('https://example.test/api/minecraft-avatar?username=TestPlayer'));
  assert.equal(routed[0].uuid, officialUuid, 'name-only list heads resolve the stored identity');
  assert.equal(routed[0].textureHash, 'stored-skin', 'all name-only surfaces reuse the saved texture');
  assert.deepEqual(responseBody, avatar);

  for (let y = 8; y < 16; y += 1) {
    for (let x = 40; x < 48; x += 1) pixels.set([0, 0, 0, 255], (y * 64 + x) * 4);
  }
  pixels.set([0, 255, 0, 255], (8 * 64 + 8) * 4);
  const coveredSkin = await sharp(pixels, { raw: { width: 64, height: 64, channels: 4 } }).png().toBuffer();
  const uncoveredAvatar = await renderOfficialMinecraftAvatar({
    uuid: 'ddac152907294791aa72d82960ed8580',
    fetchImpl: async url => String(url).includes('sessionserver.mojang.com')
      ? { ok: true, json: async () => ({ properties: [{ name: 'textures', value: texturePayload }] }) }
      : { ok: true, arrayBuffer: async () => coveredSkin }
  });
  const uncoveredPixels = await sharp(uncoveredAvatar).ensureAlpha().raw().toBuffer();
  assert.deepEqual(
    [...uncoveredPixels.subarray(0, 4)],
    [0, 255, 0, 255],
    'a solid outer layer must not hide all detail in the 2D base face'
  );
}

run()
  .then(() => console.log('Minecraft avatar tests passed.'))
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
