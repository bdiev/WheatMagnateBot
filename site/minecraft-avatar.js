'use strict';

const sharp = require('sharp');

function minecraftAvatarSources(identity) {
  const encodedIdentity = encodeURIComponent(identity);
  return [
    `https://minotar.net/helm/${encodedIdentity}/64`,
    `https://mc-heads.net/avatar/${encodedIdentity}/64`,
    `https://mc-heads.net/avatar/${encodedIdentity}/64/wide`,
    `https://mc-heads.net/avatar/${encodedIdentity}/64/slim`
  ];
}

async function fetchOk(fetchImpl, url, signal, accept) {
  const response = await fetchImpl(url, { signal, headers: { Accept: accept } });
  if (!response.ok || response.status === 204) {
    throw Object.assign(new Error(`Avatar source returned HTTP ${response.status}.`), { statusCode: response.status });
  }
  return response;
}

async function resolveOfficialMinecraftSkin({ username, uuid, fetchImpl = fetch, signal, includeBody = false } = {}) {
  let compactUuid = String(uuid || '').replace(/-/g, '').trim().toLowerCase();
  const resolveUsername = async () => {
    const profileResponse = await fetchOk(
      fetchImpl,
      `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(username)}`,
      signal,
      'application/json'
    );
    const profile = await profileResponse.json();
    return String(profile?.id || '').toLowerCase();
  };
  if (!compactUuid) compactUuid = await resolveUsername();
  if (!/^[0-9a-f]{32}$/.test(compactUuid)) throw new Error('Minecraft profile has no valid UUID.');

  const readTextures = async () => {
    const sessionResponse = await fetchOk(fetchImpl,
      `https://sessionserver.mojang.com/session/minecraft/profile/${compactUuid}`, signal, 'application/json');
    const session = await sessionResponse.json();
    const encodedTextures = session?.properties?.find(property => property?.name === 'textures')?.value;
    if (!encodedTextures) throw Object.assign(new Error('Minecraft profile has no skin textures.'), { code: 'MISSING_TEXTURES' });
    return JSON.parse(Buffer.from(String(encodedTextures), 'base64').toString('utf8'));
  };
  let textures;
  try {
    textures = await readTextures();
  } catch (error) {
    // Server/offline UUIDs can differ from the Mojang account UUID. Resolve
    // the name when that profile is missing, without doubling rate-limited calls.
    if (!uuid || !/^[A-Za-z0-9_]{1,16}$/.test(username || '')
      || !([204, 404].includes(error.statusCode) || error.code === 'MISSING_TEXTURES')) throw error;
    const resolvedUuid = await resolveUsername();
    if (!/^[0-9a-f]{32}$/.test(resolvedUuid) || resolvedUuid === compactUuid) throw error;
    compactUuid = resolvedUuid;
    textures = await readTextures();
  }
  const skin = textures?.textures?.SKIN;
  const skinUrl = new URL(skin?.url);
  if (skinUrl.hostname !== 'textures.minecraft.net') throw new Error('Minecraft profile returned an invalid skin URL.');
  skinUrl.protocol = 'https:';
  const textureHash = skinUrl.pathname.split('/').filter(Boolean).at(-1)?.toLowerCase();
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(textureHash || '')) throw new Error('Minecraft profile returned an invalid skin hash.');

  let capeHash = null;
  let capeUrl = null;
  if (textures?.textures?.CAPE?.url) {
    const resolvedCapeUrl = new URL(textures.textures.CAPE.url);
    if (resolvedCapeUrl.hostname !== 'textures.minecraft.net') throw new Error('Minecraft profile returned an invalid cape URL.');
    resolvedCapeUrl.protocol = 'https:';
    capeHash = resolvedCapeUrl.pathname.split('/').filter(Boolean).at(-1)?.toLowerCase() || null;
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(capeHash || '')) throw new Error('Minecraft profile returned an invalid cape hash.');
    capeUrl = resolvedCapeUrl.href;
  }

  const result = {
    uuid: compactUuid,
    textureHash,
    textureUrl: skinUrl.href,
    model: skin?.metadata?.model === 'slim' ? 'slim' : 'classic',
    capeHash,
    capeUrl
  };
  if (!includeBody) return result;

  const skinResponse = await fetchOk(fetchImpl, skinUrl.href, signal, 'image/png');
  const body = Buffer.from(await skinResponse.arrayBuffer());
  const metadata = await sharp(body).metadata();
  if ((metadata.width || 0) < 64 || ![32, 64].includes(metadata.height || 0) || metadata.width !== 64) {
    throw new Error('Minecraft skin has invalid dimensions.');
  }
  return { ...result, body };
}

async function renderOfficialMinecraftAvatar({ username, uuid, textureHash, fetchImpl = fetch, signal } = {}) {
  let skin;
  if (textureHash) {
    if (!/^[a-z0-9_-]{1,128}$/i.test(textureHash)) throw new Error('Invalid Minecraft skin hash.');
    const response = await fetchOk(fetchImpl, `https://textures.minecraft.net/texture/${textureHash}`, signal, 'image/png');
    skin = Buffer.from(await response.arrayBuffer());
  } else {
    const resolvedSkin = await resolveOfficialMinecraftSkin({ username, uuid, fetchImpl, signal, includeBody: true });
    skin = resolvedSkin.body;
  }
  if (!skin.length || skin.length > 256 * 1024) throw new Error('Minecraft skin has invalid size.');
  const metadata = await sharp(skin).metadata();
  if (metadata.width !== 64 || ![32, 64].includes(metadata.height)) throw new Error('Minecraft skin has invalid dimensions.');

  const face = await sharp(skin).extract({ left: 8, top: 8, width: 8, height: 8 }).ensureAlpha().png().toBuffer();
  const outerLayer = await sharp(skin).extract({ left: 40, top: 8, width: 8, height: 8 }).ensureAlpha().png().toBuffer();
  const compositedFace = await sharp(face)
    .composite([{ input: outerLayer, blend: 'over' }])
    .png()
    .toBuffer();
  const compositedPixels = await sharp(compositedFace).ensureAlpha().raw().toBuffer();
  const visibleColors = new Set();
  for (let offset = 0; offset < compositedPixels.length; offset += 4) {
    if (compositedPixels[offset + 3] > 0) {
      visibleColors.add(compositedPixels.subarray(offset, offset + 3).toString('hex'));
    }
  }
  // A fully opaque, solid outer layer can hide a detailed base face and look
  // like a missing avatar. In that case retain the detailed 2D base layer.
  const visibleFace = visibleColors.size > 1 ? compositedFace : face;
  return sharp(visibleFace)
    .resize(64, 64, { kernel: 'nearest' })
    .png()
    .toBuffer();
}

function createMinecraftAvatarLoader({ fetchImpl = fetch, now = Date.now, ttlMs = 6 * 60 * 60_000,
  fallbackTtlMs = 60_000, retryMs = 15_000, maxEntries = 1024 } = {}) {
  const cache = new Map();
  const pending = new Map();
  const store = (key, entry) => {
    cache.delete(key);
    cache.set(key, entry);
    if (cache.size > maxEntries) cache.delete(cache.keys().next().value);
    return entry;
  };
  return async function loadMinecraftAvatar({ username, uuid, textureHash } = {}) {
    const identity = String(uuid || username || '').replace(/-/g, '').toLowerCase();
    const cacheKey = `v6:${identity}:${textureHash || 'unknown'}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > now()) {
      if (!cached.body) throw cached.error;
      return cached;
    }
    if (pending.has(cacheKey)) return pending.get(cacheKey);
    const request = (async () => {
      try {
        const body = await renderOfficialMinecraftAvatar({ username, uuid, textureHash, fetchImpl, signal: AbortSignal.timeout(8_000) });
        return store(cacheKey, { body, verified: true, expiresAt: now() + ttlMs });
      } catch { /* Preserve a verified skin during an API/CDN outage. */ }
      if (cached?.body && cached.verified) {
        return store(cacheKey, { ...cached, expiresAt: now() + fallbackTtlMs });
      }
      // A known texture is authoritative. A name/UUID renderer may silently
      // return Steve instead, so never replace that texture with its default.
      const sources = textureHash ? [] : minecraftAvatarSources(uuid || username);
      for (const source of sources) {
        try {
          const response = await fetchOk(fetchImpl, source, AbortSignal.timeout(3_000), 'image/png');
          if (!/^image\/png\b/i.test(response.headers.get('content-type') || '')) continue;
          const body = Buffer.from(await response.arrayBuffer());
          if (body.length < 250 || body.length > 128 * 1024) continue;
          const metadata = await sharp(body).metadata();
          if (metadata.format !== 'png' || metadata.width !== 64 || metadata.height !== 64) continue;
          return store(cacheKey, { body, verified: false, expiresAt: now() + fallbackTtlMs });
        } catch { /* Try the next provider. */ }
      }
      if (cached?.body) return store(cacheKey, { ...cached, expiresAt: now() + retryMs });
      const error = Object.assign(new Error('Minecraft avatar is temporarily unavailable.'), { statusCode: 502 });
      store(cacheKey, { error, body: null, expiresAt: now() + retryMs });
      throw error;
    })();
    pending.set(cacheKey, request);
    try { return await request; }
    finally { if (pending.get(cacheKey) === request) pending.delete(cacheKey); }
  };
}

module.exports = { createMinecraftAvatarLoader, minecraftAvatarSources, renderOfficialMinecraftAvatar, resolveOfficialMinecraftSkin };
