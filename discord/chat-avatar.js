'use strict';

const sharp = require('sharp');

function createChatAvatarLoader({ fetchImpl = fetch, now = Date.now, ttlMs = 6 * 60 * 60_000, retryMs = 60_000, maxEntries = 512 } = {}) {
  const cache = new Map();

  return async function loadChatAvatar(username, { attachFiles = true } = {}) {
    const name = String(username || '').trim();
    if (!/^[a-z0-9_]{1,16}$/i.test(name)) return {};
    const key = name.toLowerCase();
    const sources = [
      `https://mc-heads.net/avatar/${key}/64.png`,
      `https://minotar.net/helm/${key}/64.png`
    ];
    const remote = { thumbnail: { url: sources[0] } };
    if (!attachFiles) return remote;

    let entry = cache.get(key);
    if (!entry || entry.expiresAt <= now()) {
      let buffer = null;
      for (const url of sources) {
        try {
          const response = await fetchImpl(url, {
            signal: AbortSignal.timeout(1500), headers: { Accept: 'image/png' }
          });
          if (!response.ok || !/^image\/png\b/i.test(response.headers.get('content-type') || '')) continue;
          const input = Buffer.from(await response.arrayBuffer());
          if (!input.length || input.length > 256 * 1024) continue;
          buffer = await sharp(input, { failOn: 'error', limitInputPixels: 1024 * 1024 })
            .resize(64, 64, { kernel: sharp.kernel.nearest }).png().toBuffer();
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

module.exports = { createChatAvatarLoader };
