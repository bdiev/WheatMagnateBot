'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_BASE_URL = 'https://mc-api.bisai.dev';
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const TYPE_PATHS = Object.freeze({
  mob: id => `/v1/mobs/${encodeURIComponent(id)}/image.png`,
  item: id => `/v1/assets/items/${encodeURIComponent(id)}/texture.png`
});

function normalizeMinecraftAssetId(value) {
  const id = String(value || '').trim().toLowerCase().replace(/^minecraft:/, '');
  return /^[a-z0-9_]{1,80}$/.test(id) ? id : null;
}

function validPng(body) {
  return Buffer.isBuffer(body)
    && body.length >= PNG_SIGNATURE.length
    && body.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE);
}

class MinecraftIconCache {
  constructor({
    cacheDir,
    fetchImpl = global.fetch,
    baseUrl = DEFAULT_BASE_URL,
    apiKey = '',
    ttlMs = DEFAULT_TTL_MS,
    maxBytes = DEFAULT_MAX_BYTES,
    timeoutMs = 8_000,
    now = () => Date.now()
  } = {}) {
    if (!cacheDir) throw new Error('Minecraft icon cache directory is required.');
    if (typeof fetchImpl !== 'function') throw new Error('A fetch implementation is required.');
    this.cacheDir = path.resolve(cacheDir);
    this.fetchImpl = fetchImpl;
    this.baseUrl = String(baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
    this.apiKey = String(apiKey || '').trim();
    this.ttlMs = Math.max(60_000, Number(ttlMs) || DEFAULT_TTL_MS);
    this.maxBytes = Math.max(1024, Number(maxBytes) || DEFAULT_MAX_BYTES);
    this.timeoutMs = Math.max(1_000, Number(timeoutMs) || 8_000);
    this.now = now;
    this.pending = new Map();
  }

  resolve(type, rawId) {
    const assetPath = TYPE_PATHS[type];
    const id = normalizeMinecraftAssetId(rawId);
    if (!assetPath || !id) {
      throw Object.assign(new Error('Invalid Minecraft icon identifier.'), { statusCode: 400 });
    }
    return {
      type,
      id,
      cachePath: path.join(this.cacheDir, type, `${id}.png`),
      upstreamUrl: `${this.baseUrl}${assetPath(id)}`
    };
  }

  async readCached(cachePath) {
    try {
      const [body, stat] = await Promise.all([
        fs.promises.readFile(cachePath),
        fs.promises.stat(cachePath)
      ]);
      if (!validPng(body) || body.length > this.maxBytes) return null;
      return { body, storedAt: stat.mtimeMs, fresh: this.now() - stat.mtimeMs < this.ttlMs };
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }

  async download(resolved) {
    const headers = { Accept: 'image/png', 'User-Agent': 'WheatMagnateBot/1.0' };
    if (this.apiKey) headers['X-API-Key'] = this.apiKey;
    let response;
    try {
      response = await this.fetchImpl(resolved.upstreamUrl, {
        headers,
        signal: AbortSignal.timeout(this.timeoutMs)
      });
    } catch (error) {
      throw Object.assign(new Error(`Minecraft icon provider is unavailable: ${error.message}`), { statusCode: 502 });
    }
    if (!response.ok) {
      const statusCode = response.status === 404 ? 404 : 502;
      throw Object.assign(new Error(response.status === 404 ? 'Minecraft icon was not found.' : 'Minecraft icon provider returned an error.'), { statusCode });
    }
    const contentLength = Number(response.headers?.get?.('content-length'));
    if (Number.isFinite(contentLength) && contentLength > this.maxBytes) {
      throw Object.assign(new Error('Minecraft icon is too large.'), { statusCode: 502 });
    }
    const contentType = String(response.headers?.get?.('content-type') || '').toLowerCase();
    if (contentType && !contentType.startsWith('image/png')) {
      throw Object.assign(new Error('Minecraft icon provider returned an invalid content type.'), { statusCode: 502 });
    }
    const body = Buffer.from(await response.arrayBuffer());
    if (!validPng(body) || body.length > this.maxBytes) {
      throw Object.assign(new Error('Minecraft icon provider returned an invalid image.'), { statusCode: 502 });
    }
    await fs.promises.mkdir(path.dirname(resolved.cachePath), { recursive: true });
    await fs.promises.writeFile(resolved.cachePath, body);
    return { body, storedAt: this.now(), cacheStatus: 'MISS' };
  }

  async get(type, rawId) {
    const resolved = this.resolve(type, rawId);
    const cached = await this.readCached(resolved.cachePath);
    if (cached?.fresh) return { ...cached, cacheStatus: 'HIT' };

    const cacheKey = `${resolved.type}:${resolved.id}`;
    if (!this.pending.has(cacheKey)) {
      this.pending.set(cacheKey, this.download(resolved)
        .catch(error => {
          if (cached) return { ...cached, cacheStatus: 'STALE' };
          throw error;
        })
        .finally(() => this.pending.delete(cacheKey)));
    }
    return this.pending.get(cacheKey);
  }
}

function minecraftIconEtag(body) {
  return `"${crypto.createHash('sha256').update(body).digest('base64url').slice(0, 20)}"`;
}

module.exports = {
  DEFAULT_MAX_BYTES,
  DEFAULT_TTL_MS,
  MinecraftIconCache,
  minecraftIconEtag,
  normalizeMinecraftAssetId,
  validPng
};
