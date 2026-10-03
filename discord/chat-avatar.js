'use strict';

const sharp = require('sharp');
const { renderOfficialMinecraftAvatar } = require('../site/minecraft-avatar');

async function hasVisibleDetail(png) {
  const pixels = await sharp(png).ensureAlpha().raw().toBuffer();
  const colors = new Set();
  for (let offset = 0; offset < pixels.length; offset += 4) {
    if (pixels[offset + 3] === 0) continue;
    colors.add(pixels.subarray(offset, offset + 3).toString('hex'));
    if (colors.size > 1) return true;
  }
  return false;
}

// Discord crops embed author icons to a circle. Keeping the head inside the
// circle's inscribed square (40 px of a 64 px canvas, with transparent
// padding) shows it as a full square head instead of a clipped disc.
const AVATAR_HEAD_SIZE = 40;
const AVATAR_CANVAS_SIZE = 64;

function padAvatarForCircleCrop(input) {
  const padding = (AVATAR_CANVAS_SIZE - AVATAR_HEAD_SIZE) / 2;
  return sharp(input)
    .resize(AVATAR_HEAD_SIZE, AVATAR_HEAD_SIZE, { kernel: sharp.kernel.nearest })
    .extend({ top: padding, bottom: padding, left: padding, right: padding, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

function createChatAvatarLoader({ fetchImpl = fetch, now = Date.now, ttlMs = 6 * 60 * 60_000, retryMs = 60_000, maxEntries = 512 } = {}) {
  const cache = new Map();

  return async function loadChatAvatar(username, { attachFiles = true } = {}) {
    const name = String(username || '').trim();
    if (!/^[a-z0-9_]{1,16}$/i.test(name)) return {};
    const key = name.toLowerCase();
    const sources = [
      `https://mc-heads.net/avatar/${key}/${AVATAR_HEAD_SIZE}.png`,
      `https://minotar.net/helm/${key}/${AVATAR_HEAD_SIZE}.png`
    ];
    const remote = {
      thumbnail: {
        url: `https://render.namemc.com/skin/2d/face.png?skin=${encodeURIComponent(name)}&scale=4`
      }
    };
    if (!attachFiles) return remote;

    let entry = cache.get(key);
    if (!entry || entry.expiresAt <= now()) {
      let buffer = null;
      try {
        const officialAvatar = await renderOfficialMinecraftAvatar({
          username: name,
          fetchImpl,
          signal: AbortSignal.timeout(5_000)
        });
        buffer = await padAvatarForCircleCrop(officialAvatar);
      } catch {
        // A third-party renderer is still useful during a Mojang API outage.
      }
      for (const url of buffer ? [] : sources) {
        try {
          const response = await fetchImpl(url, {
            signal: AbortSignal.timeout(1500), headers: { Accept: 'image/png' }
          });
          if (!response.ok || !/^image\/png\b/i.test(response.headers.get('content-type') || '')) continue;
          const input = Buffer.from(await response.arrayBuffer());
          if (!input.length || input.length > 256 * 1024) continue;
          const rendered = await padAvatarForCircleCrop(
            await sharp(input, { failOn: 'error', limitInputPixels: 1024 * 1024 }).png().toBuffer()
          );
          if (!await hasVisibleDetail(rendered)) continue;
          buffer = rendered;
          break;
        } catch {
          // Retry the second provider; an avatar outage must not drop chat.
        }
      }
      entry = { buffer: buffer || entry?.buffer || null, expiresAt: now() + (buffer ? ttlMs : retryMs) };
      cache.delete(key);
      cache.set(key, entry);
      if (cache.size > maxEntries) cache.delete(cache.keys().next().value);
    }

    if (!entry.buffer) return remote;
    const filename = `minecraft-avatar-${key}.png`;
    return {
      thumbnail: { url: `attachment://${filename}` },
      files: [{ attachment: entry.buffer, name: filename }]
    };
  };
}

module.exports = { createChatAvatarLoader, hasVisibleDetail, padAvatarForCircleCrop };
