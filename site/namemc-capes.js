'use strict';

const crypto = require('node:crypto');
const sharp = require('sharp');

const PROFILE_CACHE_TTL = 60 * 60_000;
const TEXTURE_CACHE_TTL = 24 * 60 * 60_000;
const profileCache = new Map();
const textureCache = new Map();

function hasPngSignature(body) {
  return body.length >= 8 && body.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
}

function parseNameMcCapes(markdown) {
  const capes = [];
  const seen = new Set();
  const pattern = /\(https?:\/\/namemc\.com\/cape\/([a-f0-9]{16})\s+"([^"]{1,80})"\)/gi;
  for (const match of String(markdown || '').matchAll(pattern)) {
    const hash = match[1].toLowerCase();
    if (seen.has(hash)) continue;
    seen.add(hash);
    capes.push({ hash, name:match[2].trim(), source:'namemc' });
    if (capes.length >= 100) break;
  }
  return capes;
}

function decodeNameMcCapeScript(capeHash, source) {
  const text = String(source || '').trim();
  if (!text.startsWith('nmci(') || !text.endsWith(');')) throw new Error('Invalid NameMC cape response.');
  const payload = JSON.parse(text.slice(5,-2));
  const encoded = payload?.[capeHash];
  if (typeof encoded !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    throw new Error('NameMC cape texture is missing.');
  }
  const body = Buffer.from(encoded,'base64');
  if (!hasPngSignature(body) || body.length > 512 * 1024) throw new Error('Invalid NameMC cape texture.');
  return body;
}

async function pixelFingerprint(body) {
  const pixels = await sharp(body).ensureAlpha().raw().toBuffer({ resolveWithObject:true });
  return crypto.createHash('sha256')
    .update(`${pixels.info.width}x${pixels.info.height}:`)
    .update(pixels.data)
    .digest('hex');
}

async function fetchNameMcCapeTexture(capeHash, { fetchImpl = fetch } = {}) {
  if (!/^[a-f0-9]{16}$/.test(capeHash)) throw new Error('Invalid NameMC cape identifier.');
  const cached = textureCache.get(capeHash);
  if (cached && Date.now() - cached.storedAt < TEXTURE_CACHE_TTL) return cached;
  const response = await fetchImpl(`https://s.namemc.com/i/${capeHash}.js`, {
    signal:AbortSignal.timeout(8_000),
    headers:{ Accept:'application/javascript', 'User-Agent':'WheatMagnateBot/1.0' }
  });
  if (!response.ok) throw new Error(`NameMC cape request failed: HTTP ${response.status}`);
  const source = await response.text();
  if (source.length > 1024 * 1024) throw new Error('NameMC cape response is too large.');
  const body = decodeNameMcCapeScript(capeHash,source);
  const result = { body, fingerprint:await pixelFingerprint(body), storedAt:Date.now() };
  textureCache.set(capeHash,result);
  if (textureCache.size > 500) textureCache.delete(textureCache.keys().next().value);
  return result;
}

async function fetchNameMcProfileCapes(username, { fetchImpl = fetch, forceRefresh = false } = {}) {
  if (!/^[A-Za-z0-9_]{1,16}$/.test(username)) throw new Error('Invalid Minecraft username.');
  const cacheKey = username.toLowerCase();
  const cached = profileCache.get(cacheKey);
  if (!forceRefresh && cached && Date.now() - cached.storedAt < PROFILE_CACHE_TTL) return cached.capes;
  const response = await fetchImpl(`https://r.jina.ai/http://namemc.com/profile/${encodeURIComponent(username)}`, {
    signal:AbortSignal.timeout(12_000),
    headers:{ Accept:'text/plain', 'User-Agent':'WheatMagnateBot/1.0' }
  });
  if (!response.ok) throw new Error(`NameMC profile request failed: HTTP ${response.status}`);
  const markdown = await response.text();
  if (markdown.length > 2 * 1024 * 1024) throw new Error('NameMC profile response is too large.');
  const capes = parseNameMcCapes(markdown);
  profileCache.set(cacheKey,{ capes, storedAt:Date.now() });
  if (profileCache.size > 500) profileCache.delete(profileCache.keys().next().value);
  return capes;
}

async function resolveNameMcCapes({ username, currentCapeUrl = null, fetchImpl = fetch, forceRefresh = false }) {
  const capes = await fetchNameMcProfileCapes(username,{ fetchImpl,forceRefresh });
  if (!capes.length || !currentCapeUrl) return { capes, currentCapeHash:null };

  let currentUrl;
  try {
    currentUrl = new URL(currentCapeUrl);
    if (!['http:','https:'].includes(currentUrl.protocol) || currentUrl.hostname !== 'textures.minecraft.net') {
      throw new Error('Invalid current cape URL.');
    }
  } catch {
    return { capes, currentCapeHash:null };
  }

  const currentResponse = await fetchImpl(currentUrl, {
    signal:AbortSignal.timeout(8_000),
    headers:{ Accept:'image/png', 'User-Agent':'WheatMagnateBot/1.0' }
  });
  if (!currentResponse.ok) return { capes, currentCapeHash:null };
  const currentBody = Buffer.from(await currentResponse.arrayBuffer());
  if (!hasPngSignature(currentBody) || currentBody.length > 512 * 1024) return { capes, currentCapeHash:null };
  const currentFingerprint = await pixelFingerprint(currentBody);
  const textures = await Promise.allSettled(
    capes.map(cape => fetchNameMcCapeTexture(cape.hash,{ fetchImpl }))
  );
  const currentIndex = textures.findIndex(result => result.status === 'fulfilled' && result.value.fingerprint === currentFingerprint);
  return { capes, currentCapeHash:currentIndex >= 0 ? capes[currentIndex].hash : null };
}

module.exports = {
  decodeNameMcCapeScript,
  fetchNameMcCapeTexture,
  parseNameMcCapes,
  resolveNameMcCapes
};
