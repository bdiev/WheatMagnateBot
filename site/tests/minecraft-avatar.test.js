'use strict';

const assert = require('node:assert/strict');
const sharp = require('sharp');
const { minecraftAvatarSources, renderOfficialMinecraftAvatar } = require('../minecraft-avatar');

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
