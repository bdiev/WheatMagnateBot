'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const sharp = require('sharp');
const { PermissionsBitField } = require('discord.js');
const { createChatAvatarLoader } = require('../discord/chat-avatar');

async function run() {
  const png = await sharp({ create: {
    width: 8, height: 8, channels: 4, background: { r: 30, g: 80, b: 150, alpha: 1 }
  } }).composite([{ input: await sharp({ create: {
    width: 1, height: 1, channels: 4, background: { r: 220, g: 180, b: 40, alpha: 1 }
  } }).png().toBuffer(), left: 0, top: 0 }]).png().toBuffer();
  const urls = [];
  let time = 0;
  let unavailable = false;
  const load = createChatAvatarLoader({
    now: () => time, ttlMs: 100, retryMs: 10, maxEntries: 2,
    fetchImpl: async url => {
      urls.push(url);
      if (unavailable) throw new Error('Provider unavailable');
      return url.includes('mc-heads.net')
        ? new Response('<html>Unavailable</html>', { headers: { 'content-type': 'text/html' } })
        : new Response(png, { headers: { 'content-type': 'image/png' } });
    }
  });
  const first = await load('ObbyMagnate');
  assert.equal(urls.length, 3, 'an unavailable official skin must fall back through the avatar providers');
  assert.equal(urls[2], 'https://minotar.net/helm/obbymagnate/28.png');
  assert.equal(first.thumbnail.url, `attachment://${first.files[0].name}`);
  const avatarMetadata = await sharp(first.files[0].attachment).metadata();
  assert.equal(avatarMetadata.width, 28);
  assert.equal(avatarMetadata.height, 28);
  assert.deepEqual(await load('obbymagnate'), first, 'cache lookup must ignore username casing');
  assert.equal(urls.length, 3, 'repeated messages must reuse the downloaded PNG');

  time = 101;
  unavailable = true;
  assert.deepEqual(await load('ObbyMagnate'), first, 'provider failure must preserve the last working avatar');
  assert.equal(urls.length, 6, 'a refresh must try Mojang and both fallback providers');
  await load('ObbyMagnate');
  assert.equal(urls.length, 6, 'failed refreshes must have a retry cooldown');
  const coldFailure = await load('PearlMagnate');
  assert.equal(coldFailure.files, undefined);
  assert.equal(coldFailure.thumbnail.url, 'https://render.namemc.com/skin/2d/face.png?skin=PearlMagnate&scale=4');
  const callsBeforePermissionCheck = urls.length;
  const noPermission = await load('ObbyMagnate', { attachFiles: false });
  assert.equal(noPermission.files, undefined);
  assert.equal(noPermission.thumbnail.url, 'https://render.namemc.com/skin/2d/face.png?skin=ObbyMagnate&scale=4');
  assert.equal(urls.length, callsBeforePermissionCheck, 'channels without upload permission must not fetch attachments');
  assert.deepEqual(await load('../bad name'), {});

  const blackPng = await sharp({ create: {
    width: 28, height: 28, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 }
  } }).png().toBuffer();
  const skinPixels = Buffer.alloc(64 * 64 * 4);
  for (let y = 8; y < 16; y += 1) {
    for (let x = 8; x < 16; x += 1) {
      const color = x < 12 ? [255, 0, 0, 255] : [0, 255, 0, 255];
      skinPixels.set(color, (y * 64 + x) * 4);
    }
  }
  const skin = await sharp(skinPixels, { raw: { width: 64, height: 64, channels: 4 } }).png().toBuffer();
  const texturePayload = Buffer.from(JSON.stringify({
    textures: { SKIN: { url: 'https://textures.minecraft.net/texture/moooomoooo-test' } }
  })).toString('base64');
  const moooomooooUrls = [];
  const loadBlackAvatar = createChatAvatarLoader({
    fetchImpl: async url => {
      moooomooooUrls.push(String(url));
      if (String(url).includes('api.mojang.com')) {
        return new Response(JSON.stringify({ id: 'ddac152907294791aa72d82960ed8580' }), {
          headers: { 'content-type': 'application/json' }
        });
      }
      if (String(url).includes('sessionserver.mojang.com')) {
        return new Response(JSON.stringify({ properties: [{ name: 'textures', value: texturePayload }] }), {
          headers: { 'content-type': 'application/json' }
        });
      }
      if (String(url).includes('textures.minecraft.net')) {
        return new Response(skin, { headers: { 'content-type': 'image/png' } });
      }
      return new Response(blackPng, { headers: { 'content-type': 'image/png' } });
    }
  });
  const recoveredAvatar = await loadBlackAvatar('moooomoooo');
  assert.ok(recoveredAvatar.files, 'the official 2D skin must be used before third-party renderers');
  const recoveredPixels = await sharp(recoveredAvatar.files[0].attachment).ensureAlpha().raw().toBuffer();
  const recoveredColors = new Set();
  for (let offset = 0; offset < recoveredPixels.length; offset += 4) {
    recoveredColors.add(recoveredPixels.subarray(offset, offset + 3).toString('hex'));
  }
  assert.ok(recoveredColors.size > 1, 'the Discord avatar must retain visible face detail');
  assert.ok(moooomooooUrls.some(url => url.includes('sessionserver.mojang.com')));
  assert.ok(!moooomooooUrls.some(url => url.includes('mc-heads.net') || url.includes('minotar.net')),
    'working Mojang skin data must bypass stale third-party avatar caches');

  unavailable = false;
  time = 112;
  assert.ok((await load('PearlMagnate')).files, 'downloads must recover after a provider outage');
  await load('WheatMagnate');
  const beforeEvicted = urls.length;
  await load('ObbyMagnate');
  assert.equal(urls.length, beforeEvicted + 3, 'the bounded cache must evict old entries');

  // Exercise the actual chat sender without connecting to Discord or Minecraft.
  const source = fs.readFileSync(path.join(__dirname, '../bot.js'), 'utf8');
  const sender = source.match(/async function deliverGameChatMessageToDiscord\([\s\S]*?\}\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(sender);
  const sent = [];
  const loaded = [];
  let canAttach = true;
  const channel = {
    guild: {}, isTextBased: () => true,
    permissionsFor: () => ({ has: flag => flag === PermissionsBitField.Flags.AttachFiles && canAttach }),
    send: async options => sent.push(options)
  };
  const context = vm.createContext({
    PermissionsBitField,
    console,
    isMinecraftSystemUsername: name => name === 'Server',
    recordGameChatMessage: async () => {},
    DISCORD_CHAT_CHANNEL_ID: 'test-channel',
    discordClient: { isReady: () => true, user: {}, channels: { fetch: async () => channel } },
    resolvePlayerChatTags: async () => ({ isBot: false, isNewPlayer: false }),
    formatDiscordBridgeMessage: message => message,
    loadChatAvatar: async (name, options) => { loaded.push({ name, ...options }); return load(name, options); }
  });
  vm.runInContext(`${sender}\nthis.deliver = deliverGameChatMessageToDiscord;`, context);
  assert.equal(await context.deliver({ username: 'ObbyMagnate', message: 'Hello', allowMentions: false }), true);
  assert.equal(sent[0].embeds[0].thumbnail.url, `attachment://${sent[0].files[0].name}`);
  assert.ok(Buffer.isBuffer(sent[0].files[0].attachment));
  assert.equal(sent[0].embeds[0].description, 'Hello');
  await context.deliver({ username: 'Server', message: 'Announcement', allowMentions: false });
  await context.deliver({ username: 'ObbyMagnate', message: '', isSummary: true, summaryCount: 2, allowMentions: false });
  assert.equal(loaded.length, 1, 'server messages and flood summaries must not request player avatars');
  assert.equal(sent[1].files, undefined);
  assert.equal(sent[2].files, undefined);
  canAttach = false;
  await context.deliver({ username: 'ObbyMagnate', message: 'Hello again', allowMentions: false });
  assert.equal(sent[3].files, undefined);
  assert.equal(sent[3].embeds[0].thumbnail.url, 'https://render.namemc.com/skin/2d/face.png?skin=ObbyMagnate&scale=4');
  console.log('Discord chat avatar tests passed.');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
